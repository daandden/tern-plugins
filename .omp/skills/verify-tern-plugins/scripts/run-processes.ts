import { dlopen, FFIType } from "bun:ffi";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const [socket, stamps, ...roots] = process.argv.slice(2);
const { symbols: { getsid, sysctl } } = dlopen("/usr/lib/libSystem.B.dylib", {
	getsid: { args: [FFIType.i32], returns: FFIType.i32 },
	sysctl: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
});
const CTL_KERN = 1;
const KERN_ARGMAX = 8;
const KERN_PROCARGS2 = 49;
const size = new BigUint64Array([4n]);
const argmax = new Uint32Array(1);
if (sysctl(new Int32Array([CTL_KERN, KERN_ARGMAX]), 2, argmax, size, null, 0n) !== 0) {
	throw new Error("cannot read kern.argmax");
}
const bytes = new Uint8Array(argmax[0]);
const argc = new DataView(bytes.buffer);
const mib = new Int32Array([CTL_KERN, KERN_PROCARGS2, 0]);
const marker = new TextEncoder().encode(`TERN_DAEMON_SOCKET=${socket}`);

function hasRunSocket(pid: number): boolean {
	mib[2] = pid;
	size[0] = BigInt(bytes.length);
	if (sysctl(mib, 3, bytes, size, null, 0n) !== 0) return false;
	const end = Number(size[0]);
	if (end < 4) return false;
	// The kernel returns argc, the executable path, padding, argv, then NUL-delimited environment entries.
	let offset = bytes.indexOf(0, 4) + 1;
	if (offset <= 4) return false;
	while (offset < end && bytes[offset] === 0) offset++;
	for (let i = 0, n = argc.getInt32(0, true); i < n; i++) {
		offset = bytes.indexOf(0, offset) + 1;
		if (offset === 0 || offset >= end) return false;
	}
	while (offset < end) {
		const next = bytes.indexOf(0, offset);
		if (next <= offset || next >= end) return false;
		if (next - offset === marker.length && marker.every((byte, i) => bytes[offset + i] === byte)) return true;
		offset = next + 1;
	}
	return false;
}

const snapshot = Bun.spawnSync(["/bin/ps", "-x", "-U", String(process.getuid!()), "-o", "pid=,ppid=,tty=,lstart="], {
	env: { LC_ALL: "C" }, stderr: "inherit",
});
if (snapshot.exitCode !== 0) throw new Error("cannot list this user's processes");
const processes = new Map<number, { tty: string; start: string }>();
const children = new Map<number, number[]>();
for (const line of snapshot.stdout.toString().trimEnd().split("\n")) {
	const row = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
	if (!row) throw new Error("unexpected process listing");
	const [, pid, parent, tty, start] = row;
	processes.set(Number(pid), { tty, start });
	const siblings = children.get(Number(parent));
	if (siblings) siblings.push(Number(pid));
	else children.set(Number(parent), [Number(pid)]);
}

const owned = new Set<number>();
function ownTree(pid: number): void {
	if (!processes.has(pid) || owned.has(pid)) return;
	owned.add(pid);
	for (const child of children.get(pid) ?? []) ownTree(child);
}
for (const root of roots) ownTree(Number(root));
const previous = new Map(readdirSync(stamps).map(name => [Number(name), readFileSync(`${stamps}/${name}`, "utf8").trimEnd()]));
for (const [pid, { start }] of processes) {
	if (!owned.has(pid) && (previous.get(pid) === start || hasRunSocket(pid))) ownTree(pid);
}
// macOS hides the environment of protected binaries such as /usr/bin/tail.
// A pane's own terminal session still identifies its reparented members.
const paneSessions = new Set<number>();
for (const pid of owned) {
	if (processes.get(pid)!.tty !== "??" && getsid(pid) === pid) paneSessions.add(pid);
}
if (paneSessions.size > 0) {
	for (const pid of processes.keys()) {
		if (!owned.has(pid) && paneSessions.has(getsid(pid))) ownTree(pid);
	}
}
for (const pid of owned) {
	const { start } = processes.get(pid)!;
	if (previous.get(pid) !== start) writeFileSync(`${stamps}/${pid}`, `${start}\n`);
}
console.log([...owned].join(" "));

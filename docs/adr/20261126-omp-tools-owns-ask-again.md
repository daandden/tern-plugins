# omp-tools owns ask again, with a card that looks native

The user wants three things native `ask` lacks on omp 19.2.1: Notes with line breaks, one general note for the whole ask, and pictures in that general note (native `ask` already accepts pasted pictures in option Notes). omp-tools therefore overrides `ask` again with its own card, which copies native ask's look in a plain terminal and in Tern. The card takes the composer while it waits, as the retired Picker did, so focus, keys and pasted pictures reach it directly. To keep `/btw` usable while an ask waits, the card accepts `/btw` itself and answers in the same Side question thread as `/btw` from the composer. This supersedes ADR 20261123-retire-the-picker-for-native-ask for the `ask` tool.

## Considered options

- Add the features to native `ask` upstream in omp. Three independent design attempts recommended it, because it keeps native placement, `/tree` re-answer and the Flow panel with no plugin card to maintain. Rejected by the user in favour of a card the plugin controls now.
- An optional `<textarea>` in each form. Rejected: no pictures, and option Notes stay single-line.
- The card as a widget above the composer, with emulated focus. Rejected: omp 19.2.1 gives extensions no real focus switch or Tern image-paste target there.

## Consequences

- `/tree` re-answer still runs native `ask` and shows the native card, without the general note or multiline Notes.
- The card holds omp's waiting status itself (`holdBlockedStatus`), and vstack's Flow panel needs an explicit hook, because the card does not go through `ui.formDialog`.
- Each omp release needs a look-parity check of the card in both clients, the upkeep that retired the Picker.

# Authoring explorables

This guide is for everyone who writes or changes a page, people and coding agents alike. The pages are published for a general audience, so write for a stranger who has only the page's prerequisites.

An explorable teaches **one idea**, using the **smallest model** that makes it visible, to a reader who has its **prerequisites**. The reader operates the model; the author still leads the argument.

## Plan the outline before building pages

The `Pages` list in `README.md` is the outline. Before writing a page, add its line:

- **Idea:** the one thing the page teaches.
- **Why:** the chain of whys under the idea (why it exists, why it works this way, why its key term is named so), followed until it reaches the page's Assumes line.
- **Surprise:** what a newcomer gets wrong or never thinks to ask. The page is built around it.
- **Assumes:** earlier pages or outside knowledge the reader needs.
- **Afterwards:** what the reader can do without the page.

If a page needs an idea that is not in its prerequisites, teach it on the page or make it an earlier page. A page that teaches the fourth idea in a chain to a reader who has none of the first three fails however well it is drawn.

## Write for a reader who lacks the vocabulary

- Define every technical term in plain words before using it. Do not lead with jargon ("steps downhill on its loss") that only makes sense once the page has been understood.
- Follow each equation with a plain-language reading of what it says.
- Predictions must be answerable by intuition, without algebra; the math explains the answer afterwards.

## Build on why

Every explanation rests on a chain of whys, the questions a curious child would keep asking. The Why line in the outline is the page's foundation, not its script.

- Answer each why where the reader would ask it, in the opener or midway when attention needs a fresh spark. A good why often reopens a page: the reader has seen the step work and now wonders why it has to be that way.
- Vary the form. A puzzle, a failed attempt, a term's origin or a question the reader poses with the model can each answer a why. Never open sections with the word "why" or a stock question; a pattern the reader can predict stops working.
- When a term's name helps or misleads, give its origin in a sentence. If the honest answer is that someone liked the word, say so.
- A chain stops at what the reader already knows. If it runs past the Assumes line, teach the missing step or make it an earlier page.

## Choose an example where the technique is actually used

- Use a problem the technique really solves, or a toy whose answer the reader already knows so they can check it (a model that finds 1.609 km per mile from example trips). If it is a toy, say so and name the real use it stands in for.
- Do not build the example around one reader's specialty. A connection to a reader's background is at most a sentence; the example has to make sense to anyone with the stated prerequisites.

## Make the interaction perform the real mechanism

Before building an interaction, ask: does the reader's action match what the system actually does, with the information the system actually has?

Example of the failure: a page let the reader drag a weight freely while plotting the loss of every value tried. Dragging swept the whole curve, so the reader found the minimum by brute force, which is exactly what gradient descent cannot do. The faithful version hides the curve, shows only the current loss and the local slope, and lets the reader take steps.

## The opener

Every page opens with a short section that does three jobs: show why the idea matters, start from something the reader already knows, and introduce the vocabulary the page uses. These are jobs, not a template.

- Derive the opener from the page's surprise; different surprises give different openers.
- Read the existing openers first and pick a different form: a story, a puzzle, a failure, a surprising number, something to do by hand.
- Do not reuse structure or stock phrases across pages.
- Keep it to about one screen and concrete. Once it needs a formula, it has become the page.

## Shape of the page

- **Climb the ladder of abstraction.** Show one concrete run, then add a control, then show every value at once, and always offer a way back down to a single run.
- **Predict, then reveal.** Pause before the interesting moment and ask for a guess; the reveal plays the model rather than asserting the answer.
- **Name the limits.** Say where the model stops matching reality.
- **End with an unaided check:** a changed example the reader solves without the page.

## Keep it truthful

- Figures are pure functions of model output; nothing moves unless the model says so.
- When data is chosen for convenience (for example, so the best fit is a round number), say so in a code comment.
- Each quantity keeps one meaning color everywhere: prose underline, control, and mark. Validate any new palette before use.

## Mechanics and verification

- No build step. Pages load `theme.css` and `explorable.js` as a classic script so they open from disk. Shared blocks are listed in `README.md`.
- Before calling a page done: load it in a headless browser, drive every control, prediction and drag, confirm there are no console errors, and look at screenshots in light mode, dark mode and at phone width.

## Contributing changes

- `main` is the published site: GitHub Pages serves the repository root, so every merge to `main` goes live. Work on a branch and open a pull request.
- A new page starts as a pull request that adds or changes its outline entry in `README.md`; build the page once the entry is agreed.
- A pull request that adds or changes a page states which controls, predictions and views were checked, and attaches light, dark and phone-width screenshots.
- Cite a source for every historical or factual claim, linked from the page.
- Keep shared blocks backwards compatible with every page, or update every page in the same change.

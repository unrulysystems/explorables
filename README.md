# Explorables

Explorable explanations: essays whose examples the reader can change. Each page
asks for a prediction, then lets the model show what actually happens.

Open `index.html` in a browser. There is nothing to install or build.

## Pages

The outline, in reading order. Each page's prerequisites come before it. Pages
not yet built are marked *planned*; `gradient-descent.html` is a first draft of
pages 3 and 4 and will be split and reworked to match.

1. **Learning a number from examples** (*planned*)
   - Idea: a program can find a number it was never told by guessing, scoring
     how wrong the guess is on known examples, and nudging it. Toy: learn km per
     mile (1.609) from logged trips; it stands in for every weight in a model.
   - Why: nobody can write the rule for most real problems, only collect
     examples of it; and without a score for how wrong a guess is, there is no
     "better" to move toward.
   - Surprise: the program never works out the rule; it only scores its own
     guesses, and that score (the loss) is a choice. Squaring the misses makes
     one big miss count more than several small ones.
   - Assumes: multiplication and averages.
   - Afterwards: given three trips and a guess, compute the loss and say which
     way to nudge.
2. **The slope says which way, and roughly how far** (*planned*)
   - Idea: the slope of the loss at the current guess, computed from the
     examples in one calculation, gives the nudge direction without trying
     both ways. The curve stays hidden; the reader sees only the current loss
     and slope, and takes the steps.
   - Why: trying both ways costs one run per weight, hopeless with billions
     of them. The loss changes smoothly as a weight changes, so its slope
     exists, and one calculation gives every weight's direction at once.
   - Surprise: on a bowl, steeper ground means farther from the bottom, so
     stepping in proportion to the slope takes big steps far away and small
     ones near the answer, without anyone planning it.
   - Assumes: page 1.
   - Afterwards: compute the slope of squared error for one weight and take
     one step by hand (the wiki's lesson 4 exercise).
3. **How big a nudge: the learning rate** (draft in `gradient-descent.html`)
   - Idea: the step is the learning rate times the slope; on a bowl, each step
     multiplies the distance to the bottom by the same number, 1 − 2aη.
   - Why: the slope only describes the ground where you stand; a big step
     lands somewhere it did not describe.
   - Surprise: a slightly bigger rate can turn settling into blowing up. The
     edge is a cliff, and where it sits depends on how steep the bowl is.
   - Assumes: page 2.
   - Afterwards: for a given bowl, name the largest rate that settles and the
     rate that lands in one step.
4. **Two weights, one learning rate** (draft in `gradient-descent.html`)
   - Idea: with several weights, one rate must serve steep and gentle
     directions at once, and the steepest sets the limit. Example: a taxi fare
     as base + rate × distance.
   - Why: a real model's weights do not all sit on equally steep ground, but
     the step size is shared, so the steepest direction caps it for all.
   - Surprise: the units of an input decide how hard learning is. Measuring
     distance in metres instead of km stretches the valley so the same data
     learns far more slowly, which is why inputs are rescaled and why
     optimizers such as Adam give each weight its own step size.
   - Assumes: page 3.
   - Afterwards: say which of two weights limits the rate, and what rescaling
     an input does to it.
5. **Scores into probabilities** (*planned*)
   - Idea: a next-word model gives each candidate word a score; softmax turns
     the scores into probabilities.
   - Why: picking the top word is all or nothing and has no slope to follow.
     A probability can rise a little, which is what lets the nudge loop learn
     language at all.
   - Surprise: only differences between scores matter (adding 100 to all of
     them changes nothing), and temperature makes the model more confident
     without adding any evidence.
   - Assumes: exponentials as repeated multiplication; none of pages 1–4.
   - Afterwards: compute softmax for two scores, and say what shifting or
     scaling them does (the wiki's lesson 3 exercise).
6. **Learning from the word that came next** (*planned*)
   - Idea: the loss for words is the negative log of the probability the model
     gave the word that actually followed.
   - Why: the probability of a whole text is the product of each word's
     probability; the log turns that product into a sum of per-word losses,
     and the minus sign makes lower better.
   - Surprise: the nudge raises the actual word and lowers every other word in
     proportion to how much the model believed it, so a confident wrong guess
     gets the biggest push. The loss rewards matching the text, not being
     correct.
   - Assumes: pages 2 and 5.
   - Afterwards: for a two-word example, compute the loss and the direction of
     each score's nudge.
7. **Matching by dot product** (*planned*)
   - Idea: a dot product scores how well two lists of numbers line up.
   - Why: comparing two lists of numbers needs one score for "how alike",
     cheap to compute and smooth to nudge; multiplying and adding is the
     simplest that is both.
   - Surprise: a longer vector scores higher without matching any better.
   - Assumes: arithmetic only.
   - Afterwards: compute a dot product, and say when a high score does not
     mean a better match (the wiki's lesson 2 exercise).
8. **Words as points** (*planned*)
   - Idea: each token is a learned row of numbers, its embedding; the next
     word is chosen by scoring every token's row against where the model ends
     up, by dot product.
   - Why: you cannot nudge "cat" a little toward "dog", but you can nudge a
     point. In mathematics, to embed is to place one structure inside another
     while keeping its shape; here words are placed in a space of numbers.
   - Surprise: nobody assigns meaning to the numbers. Words used in similar
     company drift together because that predicts the next word better. Toy:
     a tiny vocabulary with two-number embeddings, trained by the reader
     stepping gradient descent on a small text.
   - Assumes: pages 6 and 7.
   - Afterwards: explain why two words ended up close, and score a next word
     from two embeddings.
9. **Where the parameters live** (*planned*)
   - Idea: the embedding width d sets the shape of nearly every weight matrix,
     because each layer reads and writes vectors of that width; a model has
     about vocabulary × d + layers × 12d² weights.
   - Why: every layer adds its result back into the same vector, so the width
     has to match everywhere, and it multiplies through each matrix.
   - Surprise: in GPT-2 small the embedding table is 38.6M of 124M weights,
     and doubling the width quadruples each layer. The shape is a capacity
     budget; what the model knows is in the values.
   - Assumes: page 8.
   - Afterwards: estimate a model's parameter count from its vocabulary,
     width and layer count.
10. **Attention** (*planned*)
   - Idea: each position's output is a weighted average of the values at other
     positions, with weights from a softmax over query–key match scores.
   - Why: an embedding is the same whatever surrounds the word, but meaning is
     not ("river bank", "bank loan"), so each position has to gather its
     context. The name "transformer" for the whole design is not an
     explanation: its author picked it partly for the sound.
   - Surprise: the output is a blend, not a lookup, and masking a position
     removes it entirely.
   - Assumes: pages 5, 7 and 8.
   - Afterwards: compute two attention weights and the weighted value, with and
     without a mask (the wiki's lesson 5 exercise).

The order differs from the ai-wiki learning path, which goes vectors, loss,
then gradients: gradient descent on one number needs neither vectors nor
softmax, so it comes first here. Worked numbers match the wiki where topics
overlap.

## Building blocks

Every page loads two shared files and adds its own script:

- `theme.css`: layout, typography, and the meaning colors. Each quantity keeps
  one color everywhere it appears (`--c-param`, `--c-rate`, `--c-loss`).
- `explorable.js`: reactive state (`X.signal`, `X.derived`, `X.effect`) and
  the inline elements:
  - `<x-scrub>`: a number in a sentence that the reader drags.
  - `<x-show>`: a live value in a sentence.
  - `<x-predict>`: the reader commits to an answer before the page reveals it.
  - `<x-player>`: play and step through time.

A page's own script holds its model as pure functions and draws each figure
from model output, so nothing on screen moves unless the model says so.

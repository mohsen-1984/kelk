---
title: AI Literacy
footer: AI literacy | a Kelk slides sample
dir: ltr
presenter: Kelk
tagline: Write Markdown, present like a pro
classification: Public
contact: hello@example.com
logo: data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjYyIiBoZWlnaHQ9IjYyIiByeD0iMTQiIGZpbGw9IiNmZmZmZmYiIHN0cm9rZT0iI2Q0ZGRkOSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHBhdGggZD0iTTMyIDkgNDcgMzAgMzcgNTVIMjdMMTcgMzBaIiBmaWxsPSIjMWY2ZjVjIi8+PHBhdGggZD0iTTMyIDMxdjIwIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSIzMiIgY3k9IjI5IiByPSIzLjYiIGZpbGw9IiNmZmZmZmYiLz48Y2lyY2xlIGN4PSI0OSIgY3k9IjQ5IiByPSI1IiBmaWxsPSIjYzA3MDMyIi8+PC9zdmc+
---

# AI Literacy

Generative AI for everyone — from the idea to responsible use

*سواد هوش مصنوعی · محو الأمية في الذكاء الاصطناعي*

A Kelk slides sample: every slide of this deck is one part of a Markdown file

<!--
Hello. In this talk we look at what generative AI is, how language models work, what they are good for in everyday work, and how to use them responsibly.
This deck is also Kelk's slides sample: read its Markdown in the editor and compare each part with its slide. The logo, tagline, presenter and classification come from the front matter: the logo stands on the cover and in every slide's header, and each # heading also becomes a PowerPoint section.
-->

## About this sample
<!-- layout: cards cols=4 -->

- :file-text: **One Markdown file** — each `##` is a slide, each `#` a section
- :layout-template: **Layouts from the content** — cards, steps, timelines, charts and diagrams
- :pencil-ruler: **Everything editable** — text, shapes and charts in PowerPoint
- :messages-square: **Speaker notes** — from `<!-- … -->` comments

<!--
This slide holds four cards with Lucide icons: the icon's name, between colons, comes before each item's label — like :file-text:.
-->

## The road ahead
<!-- layout: agenda -->

<!-- This list makes itself from the # headings. -->

## How the fifteen minutes are spent
<!-- chart: doughnut title="Minutes" -->

| Part | Minutes |
|---|---|
| What is AI? | 3 |
| How a language model works | 4 |
| Everyday uses | 4 |
| Responsible use | 4 |

- **15 minutes** — four parts, and a question at the end
- **A real chart** — edit it in PowerPoint with “Edit Data”

<!-- This chart is made from the Markdown table: the first column holds the categories, the second the values. -->

# What is AI?

From the idea to generative AI

## From AI to generative AI
<!-- layout: funnel -->

- **Artificial intelligence (AI)** — machines doing tasks that need human intelligence
- **Machine learning (ML)** — patterns learned from data, not hand-written rules
- **Deep learning (DL)** — neural networks of many layers
- **Generative AI (GenAI)** — making text, images, sound and code

<!--
Each layer is part of the one above it. Generative AI gets the most attention today, but it is only one branch of AI.
-->

## From Turing to ChatGPT
<!-- layout: timeline horizontal highlight=5 -->

- **1950** — Turing asks: can machines think?
- **1956** — the Dartmouth workshop names “artificial intelligence”
- **1997** — Deep Blue beats Kasparov
- **2012** — AlexNet and the deep-learning leap
- **2017** — the Transformer architecture
- **2022** — ChatGPT reaches the public

*Seventy years of research — and an unprecedented pace in 2017–2022*

<!--
The 2017 paper "Attention Is All You Need" introduced the Transformer; nearly every language model today is built on it. That is why it stands out on the timeline.
-->

## “Can machines think?”

> “I propose to consider the question, ‘Can machines think?’”
>
> — Alan Turing, “Computing Machinery and Intelligence”, 1950

<!--
This is the opening sentence of Turing's famous paper. Instead of defining "thinking", he proposed a test that later became known as the Turing test.
-->

## Narrow or general-purpose?

### Narrow AI

- Built for one task
- Face recognition, film suggestions, spam filters
- Of no use outside its own task

### General-purpose AI

- One model, very different tasks
- Writing, summarizing, translating, coding
- The base of tools like chat assistants

> [!IMPORTANT]
> “General-purpose” means **many kinds of tasks**, not “human-level intelligence” (AGI). Today's models still make mistakes, and human judgment cannot be replaced.

<!--
The term general-purpose AI also appears in the European Union's AI Act: a model that performs a wide range of distinct tasks competently. That is different from AGI, intelligence at human level in everything.
-->

# How a language model works

Data, training and prediction

## From data to answer
<!-- layout: process -->

1. **Data** — a vast amount of text
2. **Pre-training** — predicting the next token
3. **Tuning** — following instructions, safety
4. **Answer** — text made token by token

<!--
A model is first pre-trained on very large data, then tuned for conversation and for following instructions. In use, it builds its answer one token at a time.
-->

## Predicting the next token

```python
# Next-token prediction, greedy (an illustration)
text = "The capital of France is"
for _ in range(3):
    probs = model.next_token_probs(text)   # one probability per token
    token = max(probs, key=probs.get)      # the most likely one
    text += token
print(text)   # → The capital of France is Paris.
```

<!--
This is not real code; it only shows the idea: the model gives every possible token a probability and picks one. Real tools usually pick with some randomness, so that answers do not all read alike.
-->

## The probability of each token

$$P(w_i) = \frac{e^{z_i}}{\sum_{j} e^{z_j}}$$

- The model gives each token $i$ a score $z_i$
- The softmax function turns scores into probabilities
- “Temperature” sets how random the choice is

<!--
Softmax turns the scores into probabilities that are all positive and add up to one. A display formula becomes a picture on the slide.
-->

## Tokens and the context window
<!-- layout: stats -->

- :hash: **≈ 4 characters** — one token of common English text
- :text: **≈ 75 words** — about 100 English tokens
- :puzzle: **Token** — a small piece of text; the unit a model reads and writes
- :scan-text: **Context window** — the most tokens a model sees at once
- :languages: **Other languages** — often split into more tokens than English

<!--
These ratios are rough and depend on the tool. The practical point: the context window is limited, and very long text may not be seen in full.
-->

## Models grew larger
<!-- chart: bar labels title="Parameters (billions)" -->

| Model | Parameters |
|---|---|
| GPT-1 (2018) | 0.117 |
| GPT-2 (2019) | 1.5 |
| GPT-3 (2020) | 175 |

<!--
In two years the number of parameters grew more than a thousand times. Larger models were one cause of the leap in quality, but not the only one: data and training methods matter too.
-->

# Everyday uses

Generative AI at work and at home

## Generative AI in everyday work
<!-- layout: cards -->

- ✍️ **Writing** — drafts of e-mails, reports and texts
- 📄 **Summarizing** — a long document in a few points
- 🌐 **Translating** — a quick draft, reviewed by a person
- 💻 **Programming** — explaining, writing and fixing code
- 🎓 **Learning** — a concept explained with examples
- 💡 **Ideas** — more options to start from

<!-- These cards carry emoji instead of Lucide icons; PowerPoint shows them in color. -->

## Making images (text-to-image)

- Makes a picture from a text description
- For first sketches, illustration and ideas
- Take care with real people and copyright
- Label made-up images as such

![An image made from a text description](placeholder)

<!--
The address placeholder draws an image frame. Put the picture in later in PowerPoint, or write a real address.
-->

## When does it fit?

| Task | A good fit? | Why |
|---|---|---|
| Drafting an e-mail | Yes | Quick, and you review it yourself |
| Summarizing a report | Yes, with review | A point may be left out |
| Exact calculation | With care | Check it with a calculator |
| Medical or legal advice | No, not alone | Mistakes cost a lot |
| Breaking news | No | A model's knowledge stops at a date |

> [!TIP]
> A simple rule: the higher **the cost of a mistake**, the more a human review is needed.

<!-- The table's first column holds the tasks; column widths follow the content. -->

## A good prompt in four steps

1. **Role** — from which point of view?
2. **Context** — who is the audience, what is the situation?
3. **Task** — what exactly do you want?
4. **Format** — a table, a list, a short text?

<!-- A numbered list of labeled items becomes "steps" by itself. -->

## An example prompt

```text
Role: You are a high-school history teacher.
Context: The students are 15 and have read about the Industrial Revolution.
Task: Write 5 multiple-choice questions.
Format: A table — question, options A–D, the right answer.
```

<!--
The same four steps in a real prompt. A code block keeps the lines as they are written.
-->

# Responsible use

Accuracy, privacy and human judgment

## Hallucination

### What it is

- A fluent, confident answer that is wrong
- A made-up source or quotation — سند ساختگی
- A wrong number or date - e.g. 1965 for 1956

### What to do

- Check important claims against a source
- Ask the model for its source
- Check numbers and quotations again

> [!WARNING]
> A language model is **not a database**: it makes likely text, not necessarily true text.

<!--
Hallucination comes with predicting tokens: the model builds a sentence that sounds likely. That is why a fluent answer is no proof of a right one.
-->

## Risks
<!-- layout: hierarchy -->

- **Risks of generative AI**
  - **Accuracy**
    - **Hallucination**
    - **Outdated knowledge**
  - **Privacy**
    - **Personal data**
    - **Trade secrets**
  - **Fairness**
    - **Bias**
    - **Unequal access**

<!-- The tree comes from a nested list: each level of the list is a level of the tree. -->

## Where to take care
<!-- layout: matrix -->

- **Low stakes, easy to check** — ideas, drafts: freely
- **Low stakes, hard to check** — long summaries: spot-check them
- **High stakes, easy to check** — code, sums: always test
- **High stakes, hard to check** — medical, legal, financial: only with an expert

<!-- A two-by-two matrix: four labeled items. -->

## Laws and guidelines
<!-- layout: timeline vertical highlight=4 -->

- **2019** — the OECD AI Principles
- **2021** — UNESCO's Recommendation on the Ethics of AI
- **2023** — the Bletchley Declaration on AI safety
- **2024** — the EU AI Act enters into force
- **2025** — the AI Act's duties for general-purpose models begin

<!--
The same kind of list as a timeline, this time vertical. The AI Act is the first comprehensive AI law, and it defines general-purpose models on their own.
-->

## The cycle of responsible use
<!-- layout: cycle -->

- **Ask** — state the goal and the context
- **Check** — accuracy and sources
- **Edit** — make the text your own
- **Disclose** — say that AI helped
- **Review** — compare the result with the goal

<!-- A cycle: the items around a circle, an arrow from each stage to the next. -->

## Levels of AI literacy
<!-- layout: pyramid -->

- **Create** — new tools and methods
- **Evaluate** — outputs and their effects
- **Apply** — sound use at work
- **Understand** — what it is, and what it is not

<!-- A pyramid: understanding is the base; each level stands on the one below. -->

## People and machines
<!-- layout: venn -->

- **People** — judgment, context, responsibility
- **AI** — speed, volume, drafts

A better result — together

<!-- A Venn diagram: each item a circle; the paragraph after the list is what they share. -->

## In one sentence

AI is an assistant, not a judge: the decision and the responsibility stay with us.

<!-- A slide that holds one short sentence becomes a "statement" slide by itself. -->

## Summing up

- Generative AI makes text, images and code — by prediction
- It saves time on everyday tasks; our review keeps the quality
- AI literacy means understanding, applying and evaluating

> [!TIP]
> **A question to discuss:** which weekly task of yours would gain most from AI — and where should you not use it?

<!--
In one sentence: generative AI is a powerful tool, provided we know how it works and check what it gives us.
-->

## Further reading

- Turing, A. M. (1950). *Computing Machinery and Intelligence* — Mind
- Vaswani et al. (2017). *Attention Is All You Need* — [arxiv.org/abs/1706.03762](https://arxiv.org/abs/1706.03762)
- UNESCO, Recommendation on the Ethics of AI — [unesco.org](https://www.unesco.org/en/artificial-intelligence/recommendation-ethics)
- The OECD AI Principles — [oecd.ai](https://oecd.ai/en/ai-principles)
- The EU Artificial Intelligence Act — [artificialintelligenceact.eu](https://artificialintelligenceact.eu)

# Thank you

Questions and discussion

<!-- The last # heading is the closing slide; it takes no section number. -->

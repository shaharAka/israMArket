# GPT-6 Luna for fast IsraMarket analysis

Luna on **Low reasoning** is the most promising fast configuration from this small
test. It took about the same time as our current Flash Lite baseline, cost about
one-sixth as much, and gave more concrete instructions. Luna on Medium was slower
without an obvious improvement on these cases. Production routing is unchanged.

## Measured results

On 11 October 2026, each configuration completed four fictional two-stage analyses:

- **GPT-6 Luna, Low:** 7.295 seconds per analysis; estimated **$0.00125232 per analysis**
  ($0.00500927 for all four).
- **GPT-6 Luna, Medium:** 19.619 seconds per analysis; estimated **$0.00196266 per analysis**
  ($0.00785063 for all four).
- **Gemini 3.5 Flash Lite, Medium, fresh baseline:** 7.339 seconds per analysis;
  estimated **$0.00829948 per analysis** ($0.03319790 for all four).

Luna Low was about **6.6 times cheaper** than the fresh Lite baseline. The tiny mean
speed difference does not demonstrate a speed advantage. The previous
[Sol/Flash comparison](model-comparison-2026-10-11.md) recorded Sol at 19.0 seconds
and $0.02777 per analysis, and Flash 3.8 at 20.5 seconds and $0.01646. Those were separate
runs, not additional calls during this test.

The new tests made **24 text calls**, with no retries, for an estimated **$0.04606 total**:
$0.01286 on OpenAI and $0.03320 on Google. Costs include returned thinking usage and
OpenAI cache writes. No cache hits were reported. These are token-based estimates,
before tax or account credits, not billing-portal receipts.

## Advice quality

All three configurations chose the intended primary action in all four cases. All
evidence keys survived validation and all action targets remained valid. That is a
targeted regression result, not a general model accuracy score.

- **Shop checkout:** Luna Low proposed a test purchase and checking that the purchase
  event arrived. Lite proposed checking for obstacles more generally; its follow-up
  compared purchases with checkout starts, which risks implying a funnel from
  independent aggregate event counts.
- **Interior designer:** Luna Low named the actual fit criterion: a full project in a
  small apartment in Haifa, with a draft for review. Lite used more general eligibility
  wording and omitted Haifa from the action. Luna Medium referred to a form in its
  diagnosis although the supplied data do not identify one; its actual recommendation
  correctly targeted the known draft.
- **Ads:** Luna Low proposed changing one product-page detail only if that detail is
  already supported, leaving the ad unchanged. It distinguished Meta-attributed
  purchase value from verified orders. Lite offered a broader page/payment checklist
  and used causal wording (“הביאה”, “הניבה”) despite attribution qualifiers.
- **Unavailable event report:** Luna Low repeated the read for the same dates, cited
  the read status and left the hypothesis empty. Lite speculated about a temporary
  fault and used less precise wording for the destination and reporting period.

Luna Low's Hebrew actions were direct (“בדקו את תהליך התשלום”, “חדדו למי השירות מתאים”).
Some language still needs review: its ads diagnosis reversed the usual attribution
wording (“המודעות שויכו ל־2 רכישות”). Its ads summary also exceeded the requested
25-word limit and returned two metric highlights where the prompt asks for one.
Medium added more process text, including a UTC read time that an owner does not need.
Neither configuration eliminates the need for clear product copy rules.

## Method and limitations

We reused exactly the frozen inputs from the first comparison. The initial production
diagnosis prompts and both closed schemas match byte-for-byte across runs. Each model's
own diagnosis feeds the recommendation stage, so the second prompt is naturally different.
Luna Low intentionally overrides only the API reasoning effort; the production prompt
stays unchanged. The runner records that distinction. All configurations used Standard
processing, a 4,096 output-token cap, a 60-second timeout and one attempt per request.

The three configurations ran concurrently. There was only one run per case, no blind
review, and the prompts already give strong guidance about the desired decisions.
This measures neither broad discovery/research nor post writing. Before selecting a
production default, extend the evaluation with unfamiliar cases, no-change outcomes,
contradictory sources and other supported business types/languages, and measure
repeated latency and failures. The present result justifies a larger Luna Low pilot.

Official Standard Luna rates are $0.10 per million ordinary input tokens, $0.01 cached
input, $0.125 cache writes and $0.50 output. Its supported reasoning efforts include
Low and Medium. [Official GPT-6 Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).
Flash Lite rates used were $0.30 input / $2.50 output per million tokens.
[Google pricing](https://ai.google.dev/gemini-api/docs/pricing).

## Evidence and reproduction

- [Luna Low responses, usage and prompts](model-comparison-luna-low-2026-10-11.json)
- [Luna Medium responses, usage and prompts](model-comparison-luna-medium-2026-10-11.json)
- [Fresh Flash Lite responses, usage and prompts](model-comparison-lite-medium-2026-10-11.json)

The opt-in runner is `scripts/compare-analytics-models.py`. It now accepts explicit
`--model gpt-6-luna` with `--reasoning low` or `medium`, or
`--model gemini-3.5-flash-lite --reasoning medium`, alongside the existing provider,
private environment, frozen fixture and new output-path arguments. Defaults preserve
the original Sol/Flash comparison. An incompatible provider/model is rejected before
reading a key or making requests. Eight offline accounting/contract checks passed.

Refs #58. Production routing and the remaining proactive-update scope are unchanged.

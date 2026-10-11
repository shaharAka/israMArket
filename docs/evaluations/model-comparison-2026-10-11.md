# Gemini 3.8 Flash versus GPT-6.1 Sol: IsraMarket analysis

GPT-6.1 Sol is promising for the decisions that tell an owner what to change. In this
small evaluation it produced more specific actions and better comparison periods.
Gemini 3.8 Flash was less verbose. Both selected the intended primary action in all
four cases. This supports a further Sol pilot, rather than a production-wide migration.

For the faster tier, see the follow-up [GPT-6 Luna versus fresh Flash Lite evaluation](luna-comparison-2026-10-11.md).

## What we tested

On 11 October 2026 we made eight text requests per model: diagnosis followed by one
recommendation for each of four fictional businesses. We used the production
`diagnostics.py` prompts and the exact same saved inputs. The second prompt contains
each model's own diagnosis, so this compares the whole decision pipeline. Both received
identical closed response schemas and a 4,096 output-token cap. Thinking was MEDIUM
for both; those labels do not guarantee equal reasoning effort. No search tools,
customer data, images, video, provider-account writes or paid retries were used.

All eight requests completed for each model. Citation keys and action targets survived
the production validation. We manually reviewed whether each recommendation used the
right outcome, stayed within the supplied evidence, offered a concrete first action,
defined a relevant success check and used understandable Hebrew. These are qualitative
judgments from one run per case, not general model accuracy scores or a blinded study.

The frozen fixtures and inputs are shared. The initial prompts are byte-for-byte equal;
the recommendation schemas are equal too. OpenAI requires closed object schemas; both
providers received the same added `additionalProperties: false` constraints, without
changing which fields are required. The earlier Lite baseline used the original schema.

## Quality findings

- **Clothing shop:** both proposed checking checkout. Sol specified a mobile test
  purchase and checking that the purchase event arrived. Gemini proposed checking
  payment, shipping and returns, but its later comparison period was vague.
- **Interior designer:** both used the owner's suitable-inquiry report, without
  attributing those inquiries to Instagram. Sol supplied actual wording about full
  small-apartment projects in Haifa and an equal-length comparison period. Gemini
  exposed the internal `draft-1` identifier in the instruction shown to the owner.
- **Ads with cheap clicks and poor purchase value:** both focused on reported purchase
  value versus spend. Sol proposed one specific copy change using a supplied business
  fact, holding the rest constant, with a 28-day cost-per-purchase check. Gemini offered
  a broader product-page checklist. Its headline used “המודעות הניבו”, which still
  risks implying causation despite the Meta-report qualifier.
- **Unavailable event report:** both recommended retrying the read instead of installing
  a Pixel or treating missing purchases as zero. Sol kept the same reporting period and
  left the unsupported hypothesis empty. Gemini speculated about a communication fault.

Sol repeatedly restated limitations inside owner-facing evidence and checks. That is
accurate but adds the warning prose Shahar wants removed. Gemini's output was simpler,
but sometimes bureaucratic (“חידוד קהל היעד”) or less precise. Neither model alone fixes
the product's writing and display rules. Both also put some proposed actions into
diagnosis fields where the pipeline asks for findings.

## Measured cost and speed

Costs below are estimates from returned usage and published Standard rates, before taxes
or account credits. They include thinking tokens and OpenAI's cache-write premium; no
cache hits were reported. They are not receipts from either billing portal.

- **Gemini 3.8 Flash:** $0.06585225 for four analyses; **$0.01646306 per analysis**.
  Mean model-call time per two-stage analysis: **20.526 seconds**. Tokens: 31,043 input,
  2,175 visible output and 9,177 thinking.
- **GPT-6.1 Sol:** $0.111078 for four analyses; **$0.0277695 per analysis**.
  Mean model-call time per analysis: **19.002 seconds**. Tokens: 29,972 input, including
  29,948 cache writes; 2,203 visible output and 1,413 reasoning.
- **Total new test cost:** approximately **$0.177**, including both providers.

Sol cost about **1.69 times** as much here. Its fewer billed output/reasoning tokens
offset part of its higher unit price. The small speed difference is not evidence of
a reliable latency advantage; each case ran only once and providers ran concurrently.

Current Standard prices per million tokens are $0.75 input / $3.75 output for Gemini
3.8 Flash, versus $2 input / $10 output for Sol. Google's announced prices double on
1 January 2027. With equal ordinary input and billed output counts, Sol's rates are
2.67 times today's Gemini rates; actual usage and caching change that ratio.
[Google pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Sol model pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

Sol cache writes are $2.50 per million and replace the ordinary input rate for those
tokens. Its `output_tokens` already includes reasoning, so we counted it once. Google
reports candidates and thinking separately.
[OpenAI cache billing](https://developers.openai.com/api/docs/guides/prompt-caching),
[OpenAI reasoning usage](https://developers.openai.com/api/docs/guides/reasoning).

## Current routing and recommendation

The production container was checked directly: research/extraction and strategy use
Gemini 3.8 Flash; Results diagnosis/recommendations use Gemini 3.5 Flash Lite. The
earlier saved Lite run also chose all four intended actions, with about 7.25 seconds
per analysis. Its estimated cost from reported usage was about $0.0083 per analysis;
that historical record lacks detailed cache metadata, so it is a less complete cost
baseline than the new runs.

Keep production routing unchanged for now. Pilot Sol on consequential cross-source
decisions and assess whether its more concrete recommendations help owners act. Keep
Lite as the fast routine-analysis baseline. Before changing research, strategy or post
writing, test those jobs explicitly: this run measured analysis, not creative writing,
web extraction, asset generation or a broad multilingual workload. A larger evaluation
also needs cases where no intervention is useful and fewer prompt hints about the
expected action. These four scenarios are deliberately targeted regression cases.

## Evidence and reproduction

- [Gemini responses, raw usage and exact prompts](model-comparison-gemini-2026-10-11.json)
- [Sol responses, raw usage and exact prompts](model-comparison-sol-2026-10-11.json)
- [Earlier Lite evaluation](analytics-2026-10-11.json)
- Runner: `scripts/compare-analytics-models.py`; use the API test runtime with `--live`,
  `--provider google` or `--provider openai`, a private `--env-file`, either new result
  JSON as `--fixtures`, and a new `--output` path. This makes up to eight billable
  requests per provider and stops on the first failure.
- Offline billing/contract checks: `python -m unittest discover -s scripts/tests -p
  test_compare_analytics_models.py`. Six checks passed. No production files changed.

Refs #58. The benchmark is delivered; proactive-update policy and owner controls remain
separate unfinished scope on that issue.

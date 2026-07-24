# Zeptrix and CloudPrune search rollout

The technical and on-site changes in this repository should be deployed before
the Search Console steps below.

## Immediately after deployment

1. Confirm these production responses:
   - `https://zeptrix.io/cloudprune/` returns `200` with its canonical link and
     server-delivered product copy.
   - `https://www.zeptrix.io/` redirects permanently to
     `https://zeptrix.io/`.
   - A made-up root URL and a made-up CloudPrune URL return `404`.
   - The old EBS article redirects permanently to the consolidated EBS guide.
   - `/aws-cost-optimization` and `/reduce-aws-spend` redirect permanently to
     `/aws-cost-reduction`.
2. Run `bash scripts/verify-routes.sh https://zeptrix.io`.
3. Validate the homepage, CloudPrune page, AWS cost reduction guide, and one
   resource article in Google's Rich Results Test.

## Google Search Console

1. Use the `zeptrix.io` Domain property.
2. Submit `https://zeptrix.io/sitemap.xml`.
3. Inspect and request indexing for:
   - `https://zeptrix.io/`
   - `https://zeptrix.io/cloudprune/`
   - `https://zeptrix.io/aws-cost-reduction`
   - `https://zeptrix.io/cloudprune/resources/`
   - The EBS, unexpected-bill, NAT Gateway, RDS, CloudWatch, and
     production-safe cost reduction playbooks.
4. Check Page Indexing for soft 404, duplicate canonical, crawled-not-indexed,
   and discovered-not-indexed groups.
5. Annotate the deployment date in the team's reporting dashboard.

## Weekly measurement

Export Search Console page and query data for:

- Brand: `zeptrix`, `cloudprune`, and `zeptrix cloudprune`.
- Product: URLs beginning with `/cloudprune/`.
- Commercial: `aws cost reduction`, `aws cost optimization tool`, and
  `finops for small teams`.
- Problem-led: EBS, unexpected AWS bill, NAT Gateway, RDS, CloudWatch, and
  Free Tier queries.

Prioritize pages with growing impressions and low click-through rate before
creating more pages. Compare clicks and impressions over 28-day periods; use
average position as supporting context rather than the primary outcome.

## Evidence-led content backlog

Add these only when the underlying data, examples, or tested implementation are
available:

1. A downloadable AWS cost assessment report template.
2. An EBS monthly-cost calculator with current AWS pricing sources.
3. A NAT Gateway path and cost calculator.
4. A sanitized CloudPrune assessment with estimated versus realized savings.
5. A technical explanation of the read-only IAM policy and collected signals.
6. A quarterly anonymized AWS waste benchmark.

Every new guide should have a named author or technical reviewer, a visible
update date, tested examples, primary sources, contextual internal links, and a
clear distinction between estimates and realized savings.

## Authority and distribution

- Keep Zeptrix and CloudPrune naming, descriptions, and links consistent on
  LinkedIn, GitHub, and any eligible AWS or FinOps listings.
- Prefer original tools, datasets, customer case studies, and expert technical
  contributions that earn editorial links.
- Disclose Zeptrix affiliation in community posts.
- Do not buy links or automate forum/link placement.

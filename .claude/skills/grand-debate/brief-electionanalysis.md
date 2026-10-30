## Project under debate: electionanalysis.in

electionanalysis.in is a web platform for exploring Indian election results and running "what if" seat simulations. These facts come from its codebase; contestants and judges can't read the code, so this brief is the shared factual record.

**What it does**
- Explore Assembly (AE) and Lok Sabha (GE) results for all 36 states and UTs: an India map, state and party trends, constituency histories (winners, margins, swings, turnout, ENOP) and candidate fields such as turncoat, recontest, incumbency, gender, education and profession.
- A prediction simulator for Assembly elections. Users move sliders (anti-incumbency, turnout from 55 to 90%, a new party or third front with affinity-weighted vote transfers, alliance transfer efficiency, and 12 "factor" sliders) and see projected seats, vote shares and seats that flip. The simulation runs in the user's browser.
- Community features: users can save predictions, publish them publicly, and like or dislike other users' predictions. Sign-up is by mobile number with an OTP, optionally linked to a Google account.
- CSV/JSON export, an API with keys, embeddable widgets for other websites, and social-media preview images for shared links.
- Paid tiers through Razorpay: free (₹0), Pro (₹299 a month) and Business (₹4,999 a month).

**Data and method**
- Election data comes from the Trivedi Centre for Political Data (TCPD) at Ashoka University, which the README credits. The raw CSVs are not in the repository.
- Every prediction screen shows a disclaimer that outputs are "mathematical simulations", "not electoral forecasts", and a ±3% error band.
- The factor coefficients (for example incumbency fatigue −0.08, turnout change 0.15) are stored as round numbers in two JSON files, one for the API and one for the browser. The two copies differ. The repository has no record of how the values were estimated, and the UI calls them regression coefficients.
- The turncoat and gender factors are applied equally to every party; a code comment says a real implementation would use per-candidate flags.
- Anti-incumbency moves a fixed 70% of lost votes to the runner-up and 30% to the others. The ±3% band is a fixed rule of thumb, not a computed interval.
- Data-science notebooks exist but have no saved outputs, and the planned ML model file is not in the repository. A model card claims 65–75% accuracy on a 2021 holdout and describes fairness checks for SC/ST seats and women candidates.
- "Upcoming elections" are estimated as the last election plus five years.

**Operations, law and governance**
- Stack: React and TypeScript frontend, FastAPI and PostgreSQL backend, Redis cache, Firebase phone auth with JWT cookies, hosted on Railway and Vercel. One developer built it.
- The interface is English only. Accessibility linting was deferred in the project's backlog.
- There is no content moderation, reporting or takedown flow for community predictions, no grievance officer, and no rule that pauses public predictions during election periods.
- Terms of service, a privacy policy, a disclaimer, data export and account deletion exist. Phone numbers are masked in logs.
- The code was published under the MIT open-source licence; the repository has since been made private.
- There is no live counting-day mode.

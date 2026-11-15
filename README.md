## Inspiration

Every building runs on paperwork: inspection reports, work orders, insurance surveys and maintenance logs. The warnings about what's about to fail are already in those documents, but they're buried across hundreds of pages that nobody has time to read. When someone does find a problem, the follow-up is still a technician with a clipboard, a phone in one hand and a flashlight in the other.

We asked two questions. What if AI read every document and told you what's about to break? And what if the technician who goes to check it had an AI partner in their glasses, so they never had to touch a screen?

## What it does

REALestate turns a pile of building documents into verified, hands-free field work.

- **Upload:** a property manager creates a space for a building and uploads its documents.
- **Map:** AI agents read every page and build an interactive map of the building's systems (electrical, plumbing, HVAC and more) and how they connect. Every box links back to the exact page it came from.
- **Risks:** a risk agent flags what's likely to fail, with severity and the evidence from the source documents. In our demo building, it caught a main switchboard connection running 37 °C hotter than its sister phases, and leaking faucets wasting nearly 10,000 gallons of water a year.
- **Tickets:** each risk becomes a ticket with a safe, step-by-step checklist.
- **Verify with the glasses:** a technician wearing Ray-Ban Meta glasses opens the ticket on our Android app and talks to our resolution agent. It reads each step aloud, understands spoken answers, marks steps as passed or failed, and takes photos through the glasses on command or when a step needs evidence. It only follows the approved checklist, refuses unsafe requests like "should I open the panel myself?", and halts immediately if the technician reports fire or flooding.
- **Live dashboard:** results show up at the office instantly: the failed check in the technician's own words, the photo from the glasses pinned to that step, and false alarms closed out.

Documents find the risk. The glasses verify it.

## How we built it

- **Web dashboard:** React 19, TypeScript, Vite, Tailwind CSS v4 and shadcn/ui with a Vercel-style design. React Flow and Dagre draw the system map, and Recharts handles the charts.
- **Android app:** Kotlin and Jetpack Compose. The app decodes the glasses' live HEVC video stream with Android's hardware decoder and handles photo capture and the voice session.
- **Glasses:** Ray-Ban Meta glasses through Meta's Wearables Device Access Toolkit, for the live first-person camera, still photos and the microphone.
- **Backend:** SpacetimeDB is our database and server logic in one. Its real-time subscriptions push every change to the web and Android apps instantly.
- **AI agents:** LangChain and LangGraph on AWS Bedrock power the document extraction, flowchart, risk, ticket, chat and resolution agents. PDF.js reads documents, including scanned pages. An MCP server lets the chat agent generate live dashboard panels.
- **Voice:** ElevenLabs Scribe transcribes speech in real time, and ElevenLabs Flash speaks the agent's replies.
- **Storage:** Amazon S3 holds documents and glasses photos. Access uses short-lived presigned links, and every photo is checked against its checksum.

## Challenges we ran into

- **Streaming video from the glasses:** the glasses send raw HEVC frames, so we wrote our own parser and fed it to Android's hardware decoder to get a smooth live preview.
- **HEIC photos:** the glasses capture HEIC images, which browsers can't display and which carry rotation metadata. We convert them to JPEG on the phone and fall back to converting and rotating them in the browser.
- **Hands-free voice that's actually reliable:** deciding when someone has finished speaking, running on Bluetooth audio, and making sure silence or background noise never triggers an action.
- **Keeping the agent safe:** a voice agent in the field must never improvise. We constrained it to the approved checklist, made it refuse unsafe actions, and added an emergency halt.
- **Grounding the AI:** every node on the map and every risk had to trace back to a real page, so the output is evidence, not guesses.
- **Connecting everything live:** the glasses, phone, agents, database, cloud storage and dashboard all had to stay in sync in real time.

## Accomplishments that we're proud of

- A complete loop from document to field verification to dashboard that runs live, end to end.
- A technician can close a ticket entirely by voice, without touching the phone.
- Photos taken through the glasses land on the exact failed checklist step, verified and viewable from the office seconds later.
- The agent knows when to say no and escalates dangerous work to a qualified professional.
- A polished, production-feeling dashboard built in a weekend.

## What we learned

- Smart glasses change field work. Keeping someone's hands and eyes free matters more than any screen we could design.
- AI is most useful when it's grounded and constrained: citing sources, following a checklist and refusing to guess.
- A real-time database like SpacetimeDB removes a whole layer of backend plumbing and makes live, multi-device experiences much easier.
- Low-level media work (video codecs, image formats, audio routing) takes far longer than you'd expect, so start it early.

## What's next for REALestate

- **Predictive maintenance:** combine document risks with live sensor data such as thermal cameras and water meters to catch failures before they happen.
- **Work orders:** send confirmed issues straight into tools like ServiceTitan or Yardi, with the glasses photos attached.
- **Portfolio view:** rank risks across every building a company owns, so the worst problems get fixed first.
- **More on the glasses:** live visual checks, such as reading a gauge or spotting corrosion from the camera feed, and support for more wearables.
- **Compliance reports:** automatically generate inspection and insurance reports from verified field checks.

// Employment facilitation scene — modern editorial vector for the landing-page
// hero card. It replaces the old "person walking toward buildings" art with the
// thing the platform actually does: register a jobseeker, facilitate the match,
// bring an employer to a recruitment activity, land the opportunity.
//
// Structure: Jobseeker → PESO employment service desk → Employer, then down
// through a quiet "Employment Match" panel to matched employment. Pixel detail
// is kept only as small accents so the Quest signature survives without the
// whole illustration reading as pixel art.
//
// A11y: the SVG is exposed as a single image with a descriptive label, so screen
// readers get the flow instead of a few hundred anonymous shapes. The card's
// eyebrow and footer carry the surrounding real text.

const chipLabel = 'fill-slate-600 dark:fill-slate-300'
const chipBody = 'fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700'
const line = 'stroke-slate-200 dark:stroke-slate-700'

// Small floating opportunity card. Deliberately quiet: 9px type, hairline
// border, single colour dot.
function Chip({ x, y, w, label, dot }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="17" rx="4" strokeWidth="1" className={chipBody} />
      <rect x={x + 7} y={y + 7} width="3" height="3" className={dot} />
      <text x={x + 15} y={y + 12} fontSize="9" fontWeight="500" className={chipLabel}>{label}</text>
    </g>
  )
}

// Tick / arrow glyphs shared by the match rows.
function Tick({ x, y, tone = 'fill-emerald-500 dark:fill-emerald-400' }) {
  return (
    <g>
      <rect x={x} y={y} width="11" height="11" rx="3" className={tone} />
      <path d={`M${x + 2.6} ${y + 5.8} l2.1 2.2 l4 -5`} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-white" />
    </g>
  )
}

function ArrowMark({ x, y }) {
  return (
    <g>
      <rect x={x} y={y} width="11" height="11" rx="3" className="fill-blue-600 dark:fill-blue-500" />
      <path d={`M${x + 2.4} ${y + 5.5} h6 M${x + 6.4} ${y + 3.1} l2.4 2.4 l-2.4 2.4`} fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-white" />
    </g>
  )
}

function Jobseeker() {
  return (
    <g>
      {/* contact shadow */}
      <ellipse cx="72" cy="114" rx="14" ry="2.6" className="fill-slate-900/10 dark:fill-black/45" />
      {/* legs + shoes */}
      <rect x="64" y="92" width="6.5" height="19" className="fill-slate-700 dark:fill-slate-500" />
      <rect x="74" y="92" width="6.5" height="19" className="fill-slate-700 dark:fill-slate-500" />
      <rect x="61.5" y="109" width="9.5" height="4.5" rx="1" className="fill-slate-900 dark:fill-slate-300" />
      <rect x="74" y="109" width="9.5" height="4.5" rx="1" className="fill-slate-900 dark:fill-slate-300" />
      {/* shirt */}
      <rect x="62.5" y="62" width="19" height="33" rx="5" className="fill-blue-600 dark:fill-blue-500" />
      <path d="M68 62h8l-4 5z" className="fill-white/80 dark:fill-white/70" />
      <rect x="59.5" y="68" width="4.5" height="17" rx="2.2" className="fill-blue-700 dark:fill-blue-400" />
      <rect x="80" y="68" width="4.5" height="16" rx="2.2" className="fill-blue-700 dark:fill-blue-400" />
      {/* head */}
      <circle cx="72" cy="51.5" r="8.5" fill="#f2c9a0" />
      <rect x="63.3" y="41" width="17.4" height="6.4" rx="3.2" className="fill-slate-900 dark:fill-slate-200" />
      <rect x="63.3" y="45" width="2.6" height="5.5" rx="1.3" className="fill-slate-900 dark:fill-slate-200" />
      <rect x="78.1" y="45" width="2.6" height="5.5" rx="1.3" className="fill-slate-900 dark:fill-slate-200" />
      {/* profile card in hand */}
      <rect x="82" y="72" width="14" height="19" rx="2" strokeWidth="1" className="fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600" />
      <rect x="84.5" y="75" width="5" height="5" rx="1" className="fill-blue-200 dark:fill-blue-800" />
      <rect x="84.5" y="82" width="9" height="1.8" rx="0.9" className="fill-slate-300 dark:fill-slate-600" />
      <rect x="84.5" y="85.5" width="6" height="1.8" rx="0.9" className="fill-slate-300 dark:fill-slate-600" />
      <rect x="91" y="85" width="3" height="3" className="fill-emerald-500 dark:fill-emerald-400" />
    </g>
  )
}

function Facilitator() {
  return (
    <g>
      {/* public-service canopy over the desk */}
      <rect x="117" y="25" width="106" height="17" rx="3" className="fill-indigo-900 dark:fill-indigo-500" />
      {[0, 1, 2, 3].map(i => (
        <rect key={i} x={119 + i * 26} y="42" width="22" height="4" rx="1" className="fill-indigo-700 dark:fill-indigo-400" />
      ))}
      <text x="170" y="36.8" textAnchor="middle" fontSize="9.5" fontWeight="600" letterSpacing="2.4" className="fill-white">PESO</text>

      <ellipse cx="170" cy="118" rx="20" ry="2.6" className="fill-slate-900/10 dark:fill-black/45" />
      {/* torso + lanyard */}
      <rect x="154" y="57" width="32" height="42" rx="6" className="fill-blue-700 dark:fill-blue-600" />
      <path d="M165 57h10l-5 6z" className="fill-white/85 dark:fill-white/75" />
      <path d="M164 57l6 9 6-9" fill="none" strokeWidth="1.5" strokeLinecap="round" className="stroke-amber-400" />
      <rect x="168" y="67" width="4" height="6" rx="1" className="fill-amber-400" />
      <rect x="148.5" y="63" width="5.5" height="19" rx="2.7" className="fill-blue-600 dark:fill-blue-500" />
      <rect x="186" y="62" width="5.5" height="18" rx="2.7" className="fill-blue-600 dark:fill-blue-500" />
      {/* head */}
      <circle cx="170" cy="47" r="9" fill="#f2c9a0" />
      <rect x="160.8" y="36" width="18.4" height="6.6" rx="3.3" className="fill-slate-900 dark:fill-slate-200" />
      <rect x="160.8" y="40" width="2.8" height="5.8" rx="1.4" className="fill-slate-900 dark:fill-slate-200" />
      <rect x="176.4" y="40" width="2.8" height="5.8" rx="1.4" className="fill-slate-900 dark:fill-slate-200" />
    </g>
  )
}

function ServiceDesk() {
  return (
    <g>
      {/* documents on the counter */}
      <rect x="129" y="79" width="15" height="9" rx="1.5" strokeWidth="1" className="fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600" />
      <rect x="132" y="84" width="15" height="9" rx="1.5" strokeWidth="1" className="fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600" />
      {/* QR / check-in marker — the paperless registration cue */}
      <rect x="150" y="79" width="13" height="13" rx="2" strokeWidth="1" className="fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600" />
      <g className="fill-slate-800 dark:fill-slate-200">
        <rect x="152" y="81" width="4" height="4" />
        <rect x="157" y="81" width="4" height="4" />
        <rect x="152" y="86" width="4" height="4" />
        <rect x="157" y="86" width="2" height="2" />
      </g>
      <rect x="156" y="83.5" width="5" height="5" className="fill-amber-400" />
      {/* counter */}
      <rect x="122" y="92" width="96" height="6" rx="2" className="fill-slate-300 dark:fill-slate-600" />
      <rect x="126" y="98" width="88" height="22" rx="2" strokeWidth="1" className="fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700" />
      <rect x="126" y="98" width="88" height="2" className="fill-blue-700 dark:fill-blue-500" />
      <rect x="140" y="105" width="30" height="3" rx="1.5" className="fill-slate-200 dark:fill-slate-700" />
      <rect x="140" y="111" width="44" height="3" rx="1.5" className="fill-slate-200 dark:fill-slate-700" />
      {/* terminal */}
      <rect x="191" y="78" width="21" height="14" rx="2" className="fill-slate-800 dark:fill-slate-600" />
      <rect x="193" y="80" width="17" height="10" rx="1" className="fill-blue-50 dark:fill-blue-950" />
      <rect x="195" y="82.5" width="8" height="1.6" rx="0.8" className="fill-blue-400 dark:fill-blue-600" />
      <rect x="195" y="86" width="5" height="1.6" rx="0.8" className="fill-slate-300 dark:fill-slate-600" />
      <rect x="205" y="85.5" width="3" height="3" className="fill-emerald-500 dark:fill-emerald-400" />
      <rect x="199.5" y="92" width="4" height="4" className="fill-slate-700 dark:fill-slate-500" />
    </g>
  )
}

function Employer() {
  return (
    <g>
      <ellipse cx="268" cy="114" rx="14" ry="2.6" className="fill-slate-900/10 dark:fill-black/45" />
      <rect x="260" y="92" width="6.5" height="19" className="fill-slate-700 dark:fill-slate-500" />
      <rect x="270" y="92" width="6.5" height="19" className="fill-slate-700 dark:fill-slate-500" />
      <rect x="257.5" y="109" width="9.5" height="4.5" rx="1" className="fill-slate-900 dark:fill-slate-300" />
      <rect x="270" y="109" width="9.5" height="4.5" rx="1" className="fill-slate-900 dark:fill-slate-300" />
      {/* recruiter jacket */}
      <rect x="258.5" y="60" width="19" height="35" rx="5" className="fill-violet-600 dark:fill-violet-500" />
      <path d="M264 60h8l-4 5z" className="fill-white/80 dark:fill-white/70" />
      <rect x="277.5" y="66" width="4.5" height="17" rx="2.2" className="fill-violet-500 dark:fill-violet-400" />
      <rect x="254" y="67" width="4.5" height="16" rx="2.2" className="fill-violet-500 dark:fill-violet-400" />
      {/* vacancy card */}
      <rect x="238" y="71" width="16" height="20" rx="2" strokeWidth="1" className="fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600" />
      <rect x="238" y="71" width="16" height="5.5" rx="2" className="fill-amber-400" />
      <rect x="240.5" y="80" width="11" height="1.8" rx="0.9" className="fill-slate-300 dark:fill-slate-600" />
      <rect x="240.5" y="83.5" width="8" height="1.8" rx="0.9" className="fill-slate-300 dark:fill-slate-600" />
      <rect x="240.5" y="87" width="4" height="2.4" rx="1.2" className="fill-blue-500 dark:fill-blue-400" />
      {/* head */}
      <circle cx="268" cy="50" r="8.5" fill="#f2c9a0" />
      <rect x="259.3" y="39.6" width="17.4" height="6.4" rx="3.2" className="fill-slate-900 dark:fill-slate-200" />
      <rect x="259.3" y="43.6" width="2.6" height="5.5" rx="1.3" className="fill-slate-900 dark:fill-slate-200" />
      <rect x="274.1" y="43.6" width="2.6" height="5.5" rx="1.3" className="fill-slate-900 dark:fill-slate-200" />
    </g>
  )
}

export default function EmploymentFacilitationScene() {
  return (
    <svg
      viewBox="0 0 340 300"
      className="w-full"
      role="img"
      aria-label="Quest connects three sides of the employment facilitation journey: a jobseeker registers a profile with a PESO employment service desk, the employment facilitator matches skills and points to a recruitment activity, and a local employer brings the vacancy that results in matched employment in Cagayan."
    >
      {/* ground */}
      <path d="M14 114.5H326" strokeWidth="1" className={line} />

      {/* facilitator + canopy first so the figures layer on top of it */}
      <Facilitator />
      <ServiceDesk />
      <Jobseeker />
      <Employer />

      {/* local cue */}
      <g className="fill-blue-600 dark:fill-blue-400" style={{ shapeRendering: 'crispEdges' }}>
        <rect x="16" y="120" width="7" height="2" />
        <rect x="18" y="118" width="3" height="2" />
        <rect x="14" y="122" width="11" height="3" />
      </g>
      <text x="28" y="126" fontSize="8.5" className={chipLabel}>Cagayan</text>

      {/* connecting rail — participants, not a flowchart */}
      <path d="M72 133h88M180 133h84" strokeWidth="1.2" strokeDasharray="3 5" strokeLinecap="round" className="stroke-blue-400 dark:stroke-blue-600" />
      <path d="M164 133l-7-4v8zM262 133l-7-4v8z" className="fill-blue-500 dark:fill-blue-400" />
      {[72, 170, 268].map(x => (
        <g key={x}>
          <circle cx={x} cy="133" r="6" strokeWidth="1.6" className="fill-white stroke-blue-700 dark:fill-slate-800 dark:stroke-blue-400" />
          <circle cx={x} cy="133" r="2.4" className="fill-blue-700 dark:fill-blue-300" />
        </g>
      ))}
      <g fontSize="9" fontWeight="600" letterSpacing="0.8" textAnchor="middle" className={chipLabel}>
        <text x="72" y="151">JOBSEEKER</text>
        <text x="170" y="151">PESO FACILITATOR</text>
        <text x="268" y="151">EMPLOYER</text>
      </g>

      {/* drop into the matching panel */}
      <path d="M170 159v13" strokeWidth="1.2" strokeDasharray="3 4" strokeLinecap="round" className="stroke-blue-400 dark:stroke-blue-600" />
      <path d="M170 176l-4-7h8z" className="fill-blue-500 dark:fill-blue-400" />

      {/* Quest matching panel — the system doing the connecting */}
      <rect x="22" y="176" width="296" height="92" rx="10" strokeWidth="1" className="drop-shadow-[0_10px_18px_rgba(15,23,42,.16)] fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700 dark:drop-shadow-none" />
      <g className="fill-indigo-700 dark:fill-indigo-400" style={{ shapeRendering: 'crispEdges' }}>
        <rect x="36" y="186" width="4.5" height="4.5" />
        <rect x="41.5" y="186" width="4.5" height="4.5" />
        <rect x="36" y="191.5" width="4.5" height="4.5" />
      </g>
      <rect x="41.5" y="191.5" width="4.5" height="4.5" className="fill-amber-400" />
      <text x="52" y="194.5" fontSize="12.5" fontWeight="600" className="fill-slate-900 dark:fill-white">Employment Match</text>
      <path d="M36 205h268" strokeWidth="1" className={line} />
      <Tick x={36} y={212} />
      <Tick x={36} y={230} />
      <ArrowMark x={36} y={248} />
      <g fontSize="10.5" className="fill-slate-600 dark:fill-slate-300">
        <text x="54" y="221">Profile complete</text>
        <text x="54" y="239">Skills matched</text>
        <text x="54" y="257">Recruitment activity</text>
      </g>

      {/* outcome */}
      <path d="M170 270v6" strokeWidth="1.2" strokeDasharray="3 3" strokeLinecap="round" className="stroke-emerald-400 dark:stroke-emerald-600" />
      <circle cx="170" cy="285" r="8" className="fill-emerald-500 dark:fill-emerald-400" />
      <path d="M165.6 285.2l3 3 5.6-6" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="stroke-white" />
      <text x="183" y="288.5" fontSize="9.5" fontWeight="600" letterSpacing="0.9" className="fill-emerald-700 dark:fill-emerald-400">MATCHED EMPLOYMENT</text>

      {/* Floating opportunity cards. Staggered and kept above the canopy band
          so they read as loose annotations rather than a table header. */}
      <Chip x={6} y={6} w={58} label="Job Fair" dot="fill-blue-600 dark:fill-blue-400" />
      <Chip x={66} y={2} w={94} label="Career Guidance" dot="fill-indigo-600 dark:fill-indigo-400" />
      <Chip x={276} y={6} w={58} label="Vacancy" dot="fill-amber-500 dark:fill-amber-400" />
    </svg>
  )
}

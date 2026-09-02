"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Download, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Point = { x: number; y: number };
type DragId = "head" | "leftHand" | "rightHand" | "pelvis" | "interest";
type Pose = Record<DragId, Point>;

const NEUTRAL: Pose = {
  head: { x: 320, y: 113 }, leftHand: { x: 211, y: 288 },
  rightHand: { x: 429, y: 288 }, pelvis: { x: 320, y: 345 },
  interest: { x: 493, y: 145 },
};
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function constrainedPoint(origin: Point, target: Point, maxLength: number): Point {
  const d = distance(origin, target);
  if (d <= maxLength) return target;
  const ratio = maxLength / d;
  return { x: origin.x + (target.x - origin.x) * ratio, y: origin.y + (target.y - origin.y) * ratio };
}

function solveJoint(origin: Point, end: Point, flip: number, upper = 91, lower = 86): Point {
  const rawDistance = distance(origin, end) || 1;
  const d = clamp(rawDistance, 28, upper + lower - 3);
  const ux = (end.x - origin.x) / rawDistance;
  const uy = (end.y - origin.y) / rawDistance;
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return { x: origin.x + ux * along - uy * height * flip, y: origin.y + uy * along + ux * height * flip };
}

function jointAngle(a: Point, b: Point, c: Point) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const denom = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y) || 1;
  return Math.round((Math.acos(clamp((ab.x * cb.x + ab.y * cb.y) / denom, -1, 1)) * 180) / Math.PI);
}

export default function Home() {
  const [pose, setPose] = useState<Pose>(NEUTRAL);
  const [showRig, setShowRig] = useState(true);
  const [followCursor, setFollowCursor] = useState(true);
  const [active, setActive] = useState<DragId | null>(null);
  const [lastCorrection, setLastCorrection] = useState("Ruch mieści się w bezpiecznym zakresie.");
  const svgRef = useRef<SVGSVGElement>(null);

  const model = useMemo(() => {
    const pelvis = { x: clamp(pose.pelvis.x, 285, 355), y: clamp(pose.pelvis.y, 320, 372) };
    const torsoLean = clamp((pose.interest.x - 320) / 34, -9, 9);
    const chest = { x: pelvis.x + torsoLean, y: pelvis.y - 135 };
    const neck = { x: chest.x, y: chest.y - 35 };
    const head = constrainedPoint(neck, pose.head, 54);
    const leftShoulder = { x: chest.x - 53, y: chest.y + 6 };
    const rightShoulder = { x: chest.x + 53, y: chest.y + 6 };
    const leftHand = constrainedPoint(leftShoulder, pose.leftHand, 174);
    const rightHand = constrainedPoint(rightShoulder, pose.rightHand, 174);
    const leftElbow = solveJoint(leftShoulder, leftHand, -1);
    const rightElbow = solveJoint(rightShoulder, rightHand, 1);
    const leftHip = { x: pelvis.x - 28, y: pelvis.y };
    const rightHip = { x: pelvis.x + 28, y: pelvis.y };
    const leftFoot = { x: 274, y: 548 };
    const rightFoot = { x: 366, y: 548 };
    const leftKnee = solveJoint(leftHip, leftFoot, -0.36, 108, 104);
    const rightKnee = solveJoint(rightHip, rightFoot, 0.36, 108, 104);
    const gazeAngle = clamp(Math.atan2(pose.interest.y - head.y, pose.interest.x - head.x) * 180 / Math.PI, -28, 28);
    return { pelvis, chest, neck, head, leftShoulder, rightShoulder, leftHand, rightHand, leftElbow, rightElbow, leftHip, rightHip, leftKnee, rightKnee, leftFoot, rightFoot, gazeAngle };
  }, [pose]);

  const pointFromEvent = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    return box ? { x: ((event.clientX - box.left) / box.width) * 640, y: ((event.clientY - box.top) / box.height) * 590 } : { x: 0, y: 0 };
  }, []);

  const updatePoint = useCallback((id: DragId, point: Point) => {
    const bounds = id === "interest" ? { minX: 70, maxX: 570, minY: 70, maxY: 300 } : { minX: 80, maxX: 560, minY: 55, maxY: 555 };
    const next = { x: clamp(point.x, bounds.minX, bounds.maxX), y: clamp(point.y, bounds.minY, bounds.maxY) };
    setPose(current => ({ ...current, [id]: next }));
    if (id === "leftHand" || id === "rightHand") {
      const shoulder = id === "leftHand" ? model.leftShoulder : model.rightShoulder;
      setLastCorrection(distance(shoulder, next) > 174 ? "Ramię zatrzymane: osiągnięto maksymalny zasięg kończyny." : "Łokieć skorygowany przez dwuodcinkowy model IK.");
    } else if (id === "head") {
      setLastCorrection(distance(model.neck, next) > 54 ? "Szyja zatrzymana: głowa nie może odłączyć się od osi karku." : "Szyja pozostaje w dozwolonym zakresie.");
    } else if (id === "pelvis") {
      setLastCorrection(point.x !== next.x || point.y !== next.y ? "Miednica zatrzymana na granicy stabilnej postawy." : "Kolana kompensują zmianę położenia miednicy.");
    } else setLastCorrection("Wzrok i tułów podążają za punktem bez pełnego obrotu sylwetki.");
  }, [model.leftShoulder, model.neck, model.rightShoulder]);

  const exportPose = () => {
    const payload = { version: 1, name: "untitled-pose", controls: pose, constraints: { neckRadius: 54, armReach: 174, torsoLean: [-9, 9], gaze: [-28, 28] } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "posebound-pose.json"; link.click(); URL.revokeObjectURL(url);
  };

  const control = (id: DragId, point: Point, label: string, color = "#F6C85F") => (
    <g className="control-point" role="button" aria-label={`Przeciągnij: ${label}`} tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setActive(id); }} onPointerUp={() => setActive(null)}>
      <circle cx={point.x} cy={point.y} r="17" fill={`${color}22`} stroke={color} strokeWidth="1.5" strokeDasharray="3 4" />
      <circle cx={point.x} cy={point.y} r="6" fill={color} /><text x={point.x} y={point.y - 24} textAnchor="middle" className="handle-label">{label}</text>
    </g>
  );

  const leftElbowAngle = jointAngle(model.leftShoulder, model.leftElbow, model.leftHand);
  const rightElbowAngle = jointAngle(model.rightShoulder, model.rightElbow, model.rightHand);
  const neckOffset = Math.round(distance(model.neck, model.head));

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">PB</span><div><h1>PoseBound</h1><p>Natural motion constraints for 2D characters</p></div></div>
      <div className="top-actions"><Button variant="outline" onClick={() => { setPose(NEUTRAL); setLastCorrection("Przywrócono neutralną, stabilną postawę."); }}><RotateCcw /> Pozycja neutralna</Button><Button onClick={exportPose}><Download /> Zapisz pozę</Button></div>
    </header>
    <section className="workspace">
      <aside className="panel controls-panel">
        <div><span className="eyebrow">STEROWANIE</span><h2>Przeciągnij punkt</h2><p className="muted">Szkielet dopasuje resztę ciała, zanim poza stanie się niemożliwa.</p></div>
        <div className="control-list">{([["head","Głowa"],["leftHand","Lewa dłoń"],["rightHand","Prawa dłoń"],["pelvis","Miednica"],["interest","Punkt zainteresowania"]] as [DragId,string][]).map(([id,label], index) => <button key={id} className={`control-row ${active === id ? "active" : ""}`} onClick={() => setActive(id)}><span className="number">0{index + 1}</span><span>{label}</span><span className="coordinate">{Math.round(pose[id].x)} · {Math.round(pose[id].y)}</span></button>)}</div>
        <div className="switch-row"><div><strong>Pokaż szkielet</strong><span>Osie, stawy i uchwyty</span></div><Switch checked={showRig} onCheckedChange={setShowRig} aria-label="Pokaż szkielet" /></div>
        <div className="switch-row"><div><strong>Reakcja na kursor</strong><span>Wzrok śledzi ruch na planszy</span></div><Switch checked={followCursor} onCheckedChange={setFollowCursor} aria-label="Reakcja na kursor" /></div>
      </aside>
      <section className="stage panel" aria-label="Edytor pozy postaci">
        <div className="stage-heading"><span>WIDOK Z PRZODU</span><span className="live-dot">MODEL AKTYWNY</span></div>
        <svg ref={svgRef} viewBox="0 0 640 590" className="character-canvas" onPointerMove={(event) => { const p = pointFromEvent(event); if (active) updatePoint(active, p); else if (followCursor) setPose(current => ({ ...current, interest: p })); }} onPointerUp={() => setActive(null)} onPointerLeave={() => setActive(null)}>
          <line x1="320" y1="58" x2="320" y2="558" className="axis-line" /><ellipse cx="320" cy="551" rx="115" ry="17" className="ground-shadow" />
          <g className="body-shape">
            <line x1={model.leftHip.x} y1={model.leftHip.y} x2={model.leftKnee.x} y2={model.leftKnee.y} className="limb leg"/><line x1={model.leftKnee.x} y1={model.leftKnee.y} x2={model.leftFoot.x} y2={model.leftFoot.y} className="limb leg"/><line x1={model.rightHip.x} y1={model.rightHip.y} x2={model.rightKnee.x} y2={model.rightKnee.y} className="limb leg"/><line x1={model.rightKnee.x} y1={model.rightKnee.y} x2={model.rightFoot.x} y2={model.rightFoot.y} className="limb leg"/>
            <path d={`M ${model.chest.x-50} ${model.chest.y-10} Q ${model.chest.x-67} ${model.chest.y+65} ${model.pelvis.x-38} ${model.pelvis.y+8} L ${model.pelvis.x+38} ${model.pelvis.y+8} Q ${model.chest.x+67} ${model.chest.y+65} ${model.chest.x+50} ${model.chest.y-10} Z`} className="torso"/>
            <line x1={model.leftShoulder.x} y1={model.leftShoulder.y} x2={model.leftElbow.x} y2={model.leftElbow.y} className="limb arm"/><line x1={model.leftElbow.x} y1={model.leftElbow.y} x2={model.leftHand.x} y2={model.leftHand.y} className="limb arm"/><line x1={model.rightShoulder.x} y1={model.rightShoulder.y} x2={model.rightElbow.x} y2={model.rightElbow.y} className="limb arm"/><line x1={model.rightElbow.x} y1={model.rightElbow.y} x2={model.rightHand.x} y2={model.rightHand.y} className="limb arm"/><line x1={model.neck.x} y1={model.neck.y} x2={model.head.x} y2={model.head.y} className="neck"/>
            <g transform={`translate(${model.head.x} ${model.head.y}) rotate(${model.gazeAngle*.35})`}><path d="M-31-29 Q0-48 31-29 L27 13 Q18 39 0 46 Q-18 39-27 13Z" className="head"/><circle cx={-11+model.gazeAngle*.12} cy="1" r="3.5" className="eye"/><circle cx={11+model.gazeAngle*.12} cy="1" r="3.5" className="eye"/></g>
          </g>
          {showRig && <g className="rig">{[model.leftShoulder,model.rightShoulder,model.leftElbow,model.rightElbow,model.leftKnee,model.rightKnee,model.leftHip,model.rightHip].map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="5" className="joint"/>)}<path d={`M${model.leftElbow.x-25} ${model.leftElbow.y} A25 25 0 0 1 ${model.leftElbow.x+18} ${model.leftElbow.y-17}`} className="angle-arc"/><path d={`M${model.rightElbow.x-18} ${model.rightElbow.y-17} A25 25 0 0 1 ${model.rightElbow.x+25} ${model.rightElbow.y}`} className="angle-arc"/><line x1={model.head.x} y1={model.head.y} x2={pose.interest.x} y2={pose.interest.y} className="gaze-line"/>{control("head",pose.head,"głowa")}{control("leftHand",pose.leftHand,"dłoń L")}{control("rightHand",pose.rightHand,"dłoń P")}{control("pelvis",pose.pelvis,"miednica")}{control("interest",pose.interest,"spojrzenie","#70E1C2")}</g>}
        </svg>
        <div className="stage-footer"><Eye/><span>{lastCorrection}</span></div>
      </section>
      <aside className="panel inspector"><div><span className="eyebrow">OGRANICZENIA</span><h2>Stan stawów</h2></div><Metric label="Lewy łokieć" value={leftElbowAngle} min={18} max={158}/><Metric label="Prawy łokieć" value={rightElbowAngle} min={18} max={158}/><Metric label="Szyja · przesunięcie" value={neckOffset} min={0} max={54} suffix=" px"/><Metric label="Wzrok" value={Math.round(model.gazeAngle)} min={-28} max={28} suffix="°"/><div className="rule-card"><span className="rule-icon">↳</span><div><strong>Korekta rodzic–dziecko</strong><p>Dłoń porusza przedramię, przedramię łokieć, a dopiero później bark.</p></div></div><div className="legend"><span><i className="dot safe"/>w zakresie</span><span><i className="dot edge"/>blisko granicy</span></div></aside>
    </section>
  </main>;
}

function Metric({ label, value, min, max, suffix = "°" }: { label: string; value: number; min: number; max: number; suffix?: string }) {
  const percent = clamp(((value - min) / (max - min)) * 100, 0, 100); const edge = percent < 8 || percent > 92;
  return <div className="metric"><div className="metric-head"><span>{label}</span><strong className={edge?"edge-text":""}>{value}{suffix}</strong></div><div className="range"><span style={{width:`${percent}%`}} className={edge?"edge-fill":""}/></div><div className="limits"><span>{min}{suffix}</span><span>{max}{suffix}</span></div></div>;
}

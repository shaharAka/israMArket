"use client";

import { useEffect, useMemo } from "react";
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap,
  Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useNodesState, useReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MarketStalls } from "@/lib/icons";
import { emptyFlow } from "@/lib/draft";
import { isStepId, nextStepLabel } from "@/components/start/script";
import { FLOW_NODES, PERSONAS, nextFor, nodesFor, type FlowNode, type FlowPersona, type FlowPhase } from "@/lib/uxFlows";
import styles from "./flow-canvas.module.css";
import Image from "next/image";
import { flowCapture } from "@/lib/flowScreens";

type ScreenData = { flow: FlowNode; persona: FlowPersona; external: boolean; inspect: (id: string) => void };
type ScreenNode = Node<ScreenData, "screen">;
const NODE_TYPES = { screen: ScreenThumbnail };

// Deliberate screen lanes, not a force-directed cloud. Every arrow has a named target.
function screenPositions(phase: FlowPhase, persona: FlowPersona): Record<string, {x:number;y:number}> {
  if (phase === "before") {
    const main = nodesFor(persona, phase).filter(n => !["login", "direct-signup"].includes(n.id));
    const positions = Object.fromEntries(main.map((n, index) => {
      const row = Math.floor(index / 5), column = index % 5;
      return [n.id, {x:(row % 2 ? column : 4 - column) * 300, y:row * 280}];
    }));
    return {...positions, login:{x:1200,y:-280}, "direct-signup":{x:900,y:-280},
      "plan-first":{x:600,y:840}, dashboard:{x:1500,y:-280}, "onboarding-gate":{x:600,y:-280}};
  }
  if (phase === "after") return {
    "plan-first":{x:1500,y:0}, welcome:{x:1200,y:0}, dashboard:{x:900,y:0}, connections:{x:600,y:0},
    google:{x:300,y:0}, "source-read":{x:0,y:0},
    meta:{x:300,y:280}, pixel:{x:0,y:280}, whatsapp:{x:300,y:560}, gbp:{x:300,y:840},
    "baseline-post":{x:0,y:840}, featured:{x:-300,y:840}, photos:{x:-300,y:1120}, voice:{x:0,y:1120},
    "start-posts":{x:300,y:1120}, editor:{x:600,y:1120}, approval:{x:900,y:1120},
    publish:{x:1200,y:1120}, published:{x:1500,y:1120}, results:{x:1500,y:1400},
    "onboarding-gate":{x:1500,y:280}, name:{x:1800,y:280},
  };
  return {results:{x:900,y:0}, decision:{x:600,y:0}, "next-month":{x:300,y:0},
    dashboard:{x:0,y:0}, billing:{x:300,y:280}};
}

export function buildFlowGraph(phase: FlowPhase, branch: FlowPersona, persona: FlowPersona, inspect: (id:string)=>void) {
  const screens = nodesFor(branch, phase);
  const connections = screens.flatMap(flow => [
    {source:flow.id,target:nextFor(flow,branch),label:"",branch:false},
    ...(flow.alternate ? [{source:flow.id,target:flow.alternate.next,label:flow.alternate.label,branch:true}] : []),
    ...(flow.branches ?? []).map(b => ({source:flow.id,target:b.next,label:b.label,branch:true})),
  ]);
  const extra = [...new Set(connections.map(e => e.target))].filter(id => !screens.some(n => n.id === id));
  const all = [...screens, ...extra.map(id => FLOW_NODES.find(n=>n.id===id)!)];
  const positions = screenPositions(phase, branch);
  const nodes: ScreenNode[] = all.map((flow,index) => ({id:flow.id,type:"screen",position:positions[flow.id] ?? {x:index*300,y:1680},
    data:{flow,persona,external:flow.phase!==phase,inspect}, ariaLabel:`${flow.title}${flow.proposed ? " — הצעה" : ""}`, dragHandle:".screen-drag-handle"}));
  const edges: Edge[] = connections.map((link,index) => {
    const from = nodes.find(n=>n.id===link.source)!.position, to = nodes.find(n=>n.id===link.target)!.position;
    const vertical = Math.abs(to.y-from.y) > Math.abs(to.x-from.x);
    const sourceSide = vertical ? (to.y>from.y ? "bottom" : "top") : (to.x>from.x ? "right" : "left");
    const targetSide = vertical ? (to.y>from.y ? "top" : "bottom") : (to.x>from.x ? "left" : "right");
    const proposed = FLOW_NODES.find(n=>n.id===link.target)?.proposed;
    return {id:`${link.source}-${link.target}-${index}`,source:link.source,target:link.target,
      sourceHandle:`from-${sourceSide}`,targetHandle:`to-${targetSide}`,type:"smoothstep",
      label:link.label, style:{stroke:proposed ? "var(--primary)" : "var(--ink-muted)",strokeWidth:1.5,strokeDasharray:proposed ? "6 5" : undefined},
      markerEnd:{type:MarkerType.ArrowClosed,width:16,height:16,color:proposed ? "var(--primary)" : "var(--ink-muted)"},
      labelStyle:{fill:"var(--ink-soft)",fontSize:12,fontFamily:"var(--font-heebo)"}, labelBgStyle:{fill:"var(--canvas)"},labelBgPadding:[8,5],
      ariaLabel:`${FLOW_NODES.find(n=>n.id===link.source)!.title} אל ${FLOW_NODES.find(n=>n.id===link.target)!.title}${link.label ? `: ${link.label}` : ""}`,
    };
  });
  return {nodes,edges};
}

export function FlowCanvas(props: {phase:FlowPhase;branch:FlowPersona;persona:FlowPersona;selected:string;chapter:string;inspect:(id:string)=>void}) {
  return <ReactFlowProvider><CanvasGraph {...props} /></ReactFlowProvider>;
}

function CanvasGraph({phase,branch,persona,selected,chapter,inspect}:{phase:FlowPhase;branch:FlowPersona;persona:FlowPersona;selected:string;chapter:string;inspect:(id:string)=>void}) {
  const graph = useMemo(()=>buildFlowGraph(phase,branch,persona,inspect),[phase,branch,persona,inspect]);
  const [nodes,,onNodesChange] = useNodesState<ScreenNode>(graph.nodes);
  const flow = useReactFlow<ScreenNode>();
  const initialized = useNodesInitialized();
  const opening = nodesFor(branch,phase).slice(0,4).map(n=>n.id);
  const focused = nodes.filter(n=>chapter === "all" || (chapter === "opening" ? opening.includes(n.id) : n.data.flow.group===chapter));
  useEffect(() => {
    if (!initialized) return;
    const current = flow.getNodes();
    const ids = nodesFor(branch,phase).slice(0,4).map(n=>n.id);
    void flow.fitView({nodes: chapter === "all" ? current : current.filter(n=>chapter === "opening" ? ids.includes(n.id) : n.data.flow.group===chapter),padding:.18,maxZoom:1,duration:0});
  }, [chapter, flow, initialized, branch, phase]);
  return <div className={styles.canvas} dir="ltr" aria-label="לוח מסכים שאפשר לגרור ולהגדיל">
    <ReactFlow nodes={nodes.map(n=>({...n,selected:n.id===selected}))} edges={graph.edges} nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange} onNodeClick={(_,node)=>inspect(node.id)}
      fitView fitViewOptions={{nodes:focused,padding:.18,maxZoom:1}} minZoom={.15} maxZoom={1.6}
      nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
      panOnScroll zoomOnScroll={false} zoomOnPinch zoomActivationKeyCode="Meta"
      ariaLabelConfig={{"controls.ariaLabel":"הזזה והגדלה של הלוח","controls.zoomIn.ariaLabel":"להגדיל את המסכים","controls.zoomOut.ariaLabel":"להקטין את המסכים","controls.fitView.ariaLabel":"להציג את כל המסלול","minimap.ariaLabel":"מפת התמצאות במסלול"}}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--rule-dark)" />
      <Controls position="bottom-right" showInteractive={false} />
      <MiniMap position="bottom-left" pannable zoomable nodeColor={n=>n.selected ? "var(--primary)" : "var(--rule-dark)"} maskColor="color-mix(in srgb, var(--canvas) 70%, transparent)" maskStrokeColor="var(--ink-muted)" />
    </ReactFlow>
  </div>;
}

function ScreenThumbnail({data,selected}:NodeProps<ScreenNode>) {
  const node=data.flow;
  const capture=flowCapture(node.id);
  const reviewFlow = emptyFlow();
  reviewFlow.draft.business_model = PERSONAS[data.persona].model;
  const action = node.action.includes("לשלב הבא בדוגמה") && isStepId(node.id) ? nextStepLabel(node.id,reviewFlow) ?? node.action : node.action;
  return <div className={styles.screenNode} dir="rtl" data-selected={selected || undefined} data-proposed={node.proposed || undefined}>
    <div className={`screen-drag-handle ${styles.nodeTitle}`}><strong>{node.title}</strong><span>{data.external ? "המשך בחלק אחר" : node.proposed ? "הצעה" : node.group}</span></div>
    <button type="button" className={`nodrag ${styles.thumbnail}`} aria-label={`לפתוח מסך ${node.title}`} onClick={e=>{e.stopPropagation();data.inspect(node.id);}}>
      {capture ? <Image src={capture} alt={`צילום ${node.title} בדמו`} width={1170} height={615} className={styles.capture} unoptimized/> : <><div className={styles.miniHeader}><MarketStalls /><span>{PERSONAS[data.persona].name}</span><small>{node.route.split("?")[0]}</small></div>
      <h4>{node.headline}</h4><ThumbnailContent node={node} persona={data.persona} />
      <span className={styles.miniAction}>{action}</span></>}
    </button>
    <small className={styles.caption}>{capture ? "צילום העמוד בדמו · פתיחה לתצוגה גדולה" : "סקיצת מצב · פתיחה לתצוגה גדולה"}</small>
    {[Position.Left,Position.Right,Position.Top,Position.Bottom].map(side=><span key={side}><Handle type="target" id={`to-${side}`} position={side} isConnectable={false} /><Handle type="source" id={`from-${side}`} position={side} isConnectable={false} /></span>)}
  </div>;
}

function ThumbnailContent({node,persona}:{node:FlowNode;persona:FlowPersona}) {
  if (["quarter","plan-first","dashboard","decision","next-month"].includes(node.id)) return <div className={styles.miniPlan}><b>{PERSONAS[persona].goal}</b><p>כיוון העבודה</p><span>צעד קרוב</span><span>מה נבדוק</span></div>;
  if (["login","save","direct-signup"].includes(node.id)) return <div className={styles.miniFields}><span>Google</span><span>אימייל וסיסמה</span></div>;
  if (["connections","google","meta","pixel","whatsapp","gbp","source-read"].includes(node.id)) return <div className={styles.miniRows}>{(node.id==="connections" ? ["נתוני האתר","פייסבוק ואינסטגרם","קישור לשיחה"] : ["בחירת החשבון / הנכס","בדיקה וחזרה לתוכנית"]).map(t=><span key={t}>{t}</span>)}</div>;
  if (["editor","approval","publish","published","start-posts"].includes(node.id)) return <div className={styles.miniPost}><div>חומרי העסק</div><p>רעיון מתוך התוכנית<br />ניסוח, בדיקה ופעולה</p></div>;
  if(node.id==="results") return <div className={styles.miniFinding}><b>מה למדנו</b><span>ראיה מהמקור</span><span>המשמעות לעסק</span><span>הצעד שננסה</span></div>;
  if(node.id==="name") return <div className={styles.miniFields}><span>{PERSONAS[persona].name}</span></div>;
  if(node.id==="baseline") return <div className={styles.miniRows}>{(persona==="store" ? ["הזמנות","שווי הזמנה","קיבולת"] : ["פניות","שווי לקוח","קיבולת"]).map(t=><span key={t}>{t}<small>טווח / לא יודעים</small></span>)}</div>;
  return <p className={styles.miniBody}>{node.body}</p>;
}

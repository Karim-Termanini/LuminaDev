import type { ContainerRow, NetworkRow } from '@linux-dev-home/shared'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect } from 'react'

type SchemeProps = {
  containers: ContainerRow[]
  networks: NetworkRow[]
}

function ContainerNode({ data }: { data: ContainerRow }) {
  const isRunning = data.state.toLowerCase() === 'running'
  return (
    <div
      className="hp-card"
      style={{
        width: 260,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: 'default',
        overflow: 'visible',
        boxSizing: 'border-box',
      }}
    >
      <Handle type="target" position={Position.Top} id="in" style={{ background: 'var(--accent)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            flexShrink: 0,
            marginTop: 4,
            background: isRunning ? 'var(--green)' : 'var(--text-muted)',
          }}
          title={data.state}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              marginBottom: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={data.name}
          >
            {data.name}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={data.image}
          >
            {data.image}
          </div>
        </div>
      </div>

      {data.ports !== '—' && (
        <div
          className="mono"
          style={{
            fontSize: 11,
            background: 'var(--bg)',
            padding: '6px 8px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={data.ports}
        >
          {data.ports}
        </div>
      )}
      {data.networks && data.networks.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data.networks.slice(0, 3).map((n) => (
            <span
              key={n}
              className="mono"
              style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 6px' }}
            >
              net:{n}
            </span>
          ))}
        </div>
      ) : null}
      {data.volumes && data.volumes.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data.volumes.slice(0, 2).map((v) => (
            <span
              key={v}
              className="mono"
              style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 6px' }}
            >
              vol:{v}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const NETWORK_NODE_WIDTH = 200

function NetworkNode({ data }: { data: NetworkRow }) {
  const isSystem = data.name === 'bridge' || data.name === 'host' || data.name === 'none'
  return (
    <div
      style={{
        background: isSystem ? 'var(--bg-widget)' : 'var(--accent)',
        color: isSystem ? 'var(--text)' : '#fff',
        border: `1px solid ${isSystem ? 'var(--border)' : 'var(--accent)'}`,
        borderRadius: 10,
        padding: '10px 14px',
        fontWeight: 600,
        fontSize: 14,
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        width: NETWORK_NODE_WIDTH,
        maxWidth: NETWORK_NODE_WIDTH,
        boxSizing: 'border-box',
        cursor: 'default',
        wordBreak: 'break-word',
        lineHeight: 1.25,
      }}
    >
      <div style={{ fontWeight: 700 }} title={data.name}>
        {data.name}
      </div>
      <div style={{ fontSize: 11, opacity: 0.88, marginTop: 4 }} className="mono">
        {data.driver}
      </div>
      <Handle type="source" position={Position.Bottom} id="out" style={{ background: isSystem ? 'var(--text-muted)' : '#fff' }} />
    </div>
  )
}

function ClusterGroupNode({ data }: { data: { isSystem: boolean } }) {
  const isSystem = data.isSystem
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        background: isSystem ? 'rgba(30,30,30,0.22)' : 'color-mix(in srgb, var(--accent) 6%, transparent)',
        border: `2px dashed ${isSystem ? 'var(--border)' : 'var(--accent)'}`,
        borderRadius: 16,
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 14,
          zIndex: 1,
          background: isSystem ? 'var(--bg-panel)' : 'var(--accent)',
          color: isSystem ? 'var(--text-muted)' : '#fff',
          padding: '3px 10px',
          borderRadius: 6,
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          border: `1px solid ${isSystem ? 'var(--border)' : 'color-mix(in srgb, var(--accent) 70%, #000)'}`,
          letterSpacing: '0.06em',
          maxWidth: 'calc(100% - 28px)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {isSystem ? 'System Network' : 'Custom Project Network'}
      </div>
    </div>
  )
}

const nodeTypes = {
  containerNode: ContainerNode,
  networkNode: NetworkNode,
  clusterGroupNode: ClusterGroupNode,
}

export function DockerSchemeView({ containers, networks }: SchemeProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    if (!containers || !networks) return
    const newNodes: Node[] = []
    const newEdges: Edge[] = []

    // Group containers by primary network
    const networkContainers: Record<string, ContainerRow[]> = {}
    networks.forEach((n) => {
      if (n && n.name) networkContainers[n.name] = []
    })

    containers.forEach((c) => {
      if (!c) return
      const primaryNet = c.networks && c.networks.length > 0 ? c.networks[0] : 'none'
      if (!networkContainers[primaryNet]) {
        networkContainers[primaryNet] = []
      }
      networkContainers[primaryNet].push(c)
    })

    const CONTAINER_WIDTH = 260
    const GAP = 30
    const NET_H = 88
    /** Vertical stack: top padding (cluster label) + network + gap + container card region + bottom pad */
    const CLUSTER_PAD_TOP = 44
    const CLUSTER_PAD_BOTTOM = 20
    const NET_TO_CARD_GAP = 28
    const CONTAINER_REGION_H = 220
    const CLUSTER_MIN_W = 300

    let currentX = 50

    networks.forEach((net) => {
      const conts = networkContainers[net.name] || []
      const count = conts.length
      const innerRowW = count > 0 ? count * CONTAINER_WIDTH + Math.max(0, count - 1) * GAP : 0
      const boxWidth = Math.max(CLUSTER_MIN_W, innerRowW + 2 * GAP, NETWORK_NODE_WIDTH + 2 * GAP)
      const boxHeight =
        count > 0
          ? CLUSTER_PAD_TOP + NET_H + NET_TO_CARD_GAP + CONTAINER_REGION_H + CLUSTER_PAD_BOTTOM
          : CLUSTER_PAD_TOP + NET_H + CLUSTER_PAD_BOTTOM

      // Cluster background
      newNodes.push({
        id: `cluster-${net.name}`,
        type: 'clusterGroupNode',
        position: { x: currentX, y: 50 },
        style: { width: boxWidth, height: boxHeight },
        data: { isSystem: net.name === 'bridge' || net.name === 'host' || net.name === 'none' },
        draggable: false,
        selectable: false,
        zIndex: 0,
      })

      const rowCenter = count > 0 ? GAP + innerRowW / 2 : boxWidth / 2
      const netX = Math.max(GAP, rowCenter - NETWORK_NODE_WIDTH / 2)

      // Network node — centered above its container row (or cluster when empty)
      newNodes.push({
        id: `net-${net.name}`,
        type: 'networkNode',
        parentId: `cluster-${net.name}`,
        position: { x: netX, y: CLUSTER_PAD_TOP },
        data: net,
        zIndex: 2,
      })

      // Container cards — left-aligned row under the network
      conts.forEach((c, idx) => {
        newNodes.push({
          id: `cont-${c.id}`,
          type: 'containerNode',
          parentId: `cluster-${net.name}`,
          position: {
            x: GAP + idx * (CONTAINER_WIDTH + GAP),
            y: CLUSTER_PAD_TOP + NET_H + NET_TO_CARD_GAP,
          },
          data: c,
          zIndex: 2,
        })
      })

      currentX += boxWidth + 50
    })

    // Handle unmapped containers
    const unmappedContainers = containers.filter(c => {
      const primaryNet = c.networks && c.networks.length > 0 ? c.networks[0] : 'none'
      return !networks.find(n => n.name === primaryNet)
    })

    unmappedContainers.forEach((c, idx) => {
      newNodes.push({
        id: `cont-${c.id}`,
        type: 'containerNode',
        position: { x: currentX + idx * 300, y: 180 },
        data: c,
      })
    })

    // Create Edges for ALL networks (vertical link: network bottom → container top)
    containers.forEach((c) => {
      if (c.networks) {
        c.networks.forEach((netName) => {
          if (networks.find((n) => n.name === netName)) {
            const isSystemNet = netName === 'bridge' || netName === 'host' || netName === 'none'
            newEdges.push({
              id: `e-${c.id}-${netName}`,
              source: `net-${netName}`,
              target: `cont-${c.id}`,
              sourceHandle: 'out',
              targetHandle: 'in',
              animated: c.state.toLowerCase() === 'running',
              zIndex: 1,
              style: {
                stroke: isSystemNet ? 'var(--text-muted)' : 'var(--accent)',
                strokeWidth: 2,
                strokeDasharray: isSystemNet ? undefined : '8 5',
              },
            })
          }
        })
      }
    })

    setNodes(newNodes)
    setEdges(newEdges)
  }, [containers, networks, setNodes, setEdges])

  return (
    <div
      style={{
        width: '100%',
        minHeight: 440,
        height: 'min(70vh, calc(100vh - 220px))',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.35 }}
        colorMode="dark"
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        elevateEdgesOnSelect={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1} color="var(--border)" />
        <Controls />
      </ReactFlow>
    </div>
  )
}

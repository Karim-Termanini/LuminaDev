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
        gap: 12,
        cursor: 'default',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--accent)' }} />
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

function NetworkNode({ data }: { data: NetworkRow }) {
  const isSystem = data.name === 'bridge' || data.name === 'host' || data.name === 'none'
  return (
    <div
      style={{
        background: isSystem ? 'var(--bg-widget)' : 'var(--accent)',
        color: isSystem ? 'var(--text)' : '#fff',
        border: `1px solid ${isSystem ? 'var(--border)' : 'var(--accent)'}`,
        borderRadius: 8,
        padding: '8px 16px',
        fontWeight: 600,
        fontSize: 14,
        textAlign: 'center',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
        width: 140,
        cursor: 'default',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      {data.name}
      <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{data.driver}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  )
}

function ClusterGroupNode({ data }: { data: { isSystem: boolean } }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: data.isSystem ? 'rgba(30, 30, 30, 0.3)' : 'rgba(124, 77, 255, 0.03)',
        border: `2px dashed ${data.isSystem ? 'var(--border)' : 'var(--accent)'}`,
        borderRadius: 16,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: 20,
          background: data.isSystem ? 'var(--bg-panel)' : 'var(--accent)',
          color: data.isSystem ? 'var(--text-muted)' : '#fff',
          padding: '2px 10px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          border: `1px solid ${data.isSystem ? 'var(--border)' : 'var(--accent)'}`,
        }}
      >
        {data.isSystem ? 'System Network' : 'Custom Project Network'}
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
    const newNodes: Node[] = []
    const newEdges: Edge[] = []

    // Group containers by primary network
    const networkContainers: Record<string, ContainerRow[]> = {}
    networks.forEach((n) => {
      networkContainers[n.name] = []
    })

    containers.forEach((c) => {
      const primaryNet = c.networks && c.networks.length > 0 ? c.networks[0] : 'none'
      if (!networkContainers[primaryNet]) {
        networkContainers[primaryNet] = []
      }
      networkContainers[primaryNet].push(c)
    })

    let currentX = 50

    // Build Clusters
    networks.forEach((net) => {
      const conts = networkContainers[net.name] || []
      const count = conts.length
      
      const CONTAINER_WIDTH = 260
      const GAP = 30
      const boxWidth = Math.max(300, count * CONTAINER_WIDTH + (count + 1) * GAP)
      const boxHeight = count > 0 ? 320 : 120

      // Add Cluster Background Box
      newNodes.push({
        id: `cluster-${net.name}`,
        type: 'clusterGroupNode',
        position: { x: currentX, y: 50 },
        style: { width: boxWidth, height: boxHeight },
        data: { isSystem: net.name === 'bridge' || net.name === 'host' || net.name === 'none' },
      })

      // Add Network Node (the pill) inside the cluster
      newNodes.push({
        id: `net-${net.name}`,
        type: 'networkNode',
        parentId: `cluster-${net.name}`,
        extent: 'parent',
        position: { x: boxWidth / 2 - 86, y: 30 }, // 86 is half of 140px width + padding approx
        data: net,
      })

      // Add Containers inside the cluster
      conts.forEach((c, idx) => {
        newNodes.push({
          id: `cont-${c.id}`,
          type: 'containerNode',
          parentId: `cluster-${net.name}`,
          extent: 'parent',
          position: { x: GAP + idx * (CONTAINER_WIDTH + GAP), y: 130 },
          data: c,
        })
      })

      currentX += boxWidth + 50 // Advance X for next cluster
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

    // Create Edges for ALL networks
    containers.forEach((c) => {
      if (c.networks) {
        c.networks.forEach((netName) => {
          // Verify network exists
          if (networks.find(n => n.name === netName)) {
            newEdges.push({
              id: `e-${c.id}-${netName}`,
              source: `net-${netName}`,
              target: `cont-${c.id}`,
              animated: c.state.toLowerCase() === 'running',
              style: { stroke: 'var(--accent)', strokeWidth: 2 },
            })
          }
        })
      }
    })

    setNodes(newNodes)
    setEdges(newEdges)
  }, [containers, networks, setNodes, setEdges])

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 200px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

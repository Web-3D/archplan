/**
 * VỊ TRÍ   — archplan/src/archplan/gui/sdf-preview.ts
 * VAI TRÒ  — Mini-preview Shadertoy-style: RAYMARCH chính bladeSDF → thấy BỀ MẶT lưỡi dao (cầu/hộp/blend…) khi
 *            viết code, trước khi áp lên mái. Tự xoay quanh trục Y để đọc khối 3D.
 * LIÊN HỆ  — buildSdfEditor (roof-lab.ts) tạo + giữ; setSDF(body) khi code ĐÃ compile OK (RoofPreview validate trước).
 *            Dùng CHUNG SDF_LIB với RoofPreview → cùng helper iq. Quad toàn màn + ShaderMaterial (GLSL1, gl_FragColor).
 * DISPOSE: dispose() — loop null + ro + geo/mat/renderer + canvas remove.
 */

import * as THREE from 'three'

import { SDF_LIB } from './roof-preview'

const INIT = 180 // px cạnh khởi tạo

const VERT =
  'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'

// Raymarch SDF: camera xoay theo uTime quanh gốc, sphere-trace bladeSDF, tô theo pháp tuyến. __BODY__ = thân bladeSDF.
const FRAG = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform float uTime;',
  'uniform vec2 uRes;',
  SDF_LIB,
  'float bladeSDF(vec3 p){ __BODY__ }',
  'vec3 nrm(vec3 p){ vec2 e=vec2(0.0015,0.0); return normalize(vec3(bladeSDF(p+e.xyy)-bladeSDF(p-e.xyy), bladeSDF(p+e.yxy)-bladeSDF(p-e.yxy), bladeSDF(p+e.yyx)-bladeSDF(p-e.yyx))); }',
  'void main(){',
  '  vec2 uv = vUv*2.0-1.0; uv.x *= uRes.x/uRes.y;',
  '  float a = uTime*0.3;',
  '  vec3 ro = vec3(4.0*sin(a), 1.6, 4.0*cos(a));',
  '  vec3 ww = normalize(-ro); vec3 uu = normalize(cross(ww, vec3(0.0,1.0,0.0))); vec3 vv = cross(uu, ww);',
  '  vec3 rd = normalize(uv.x*uu + uv.y*vv + 1.6*ww);',
  '  float t = 0.0; bool hit = false;',
  '  for(int i=0;i<96;i++){ vec3 p=ro+rd*t; float d=bladeSDF(p); if(d<0.001){hit=true;break;} t+=d; if(t>30.0)break; }',
  '  vec3 col = vec3(0.11,0.13,0.16);',
  '  if(hit){ vec3 p=ro+rd*t; vec3 n=nrm(p); float df=clamp(dot(n,normalize(vec3(0.5,0.8,0.4))),0.0,1.0); col=vec3(0.16,0.62,1.0)*(0.25+0.75*df); }',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n')

const fragSrc = (body: string): string => FRAG.replace('__BODY__', body)

export class SdfPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.Camera() // ma trận không dùng (quad set gl_Position thẳng)
  private readonly canvas: HTMLCanvasElement
  private readonly mat: THREE.ShaderMaterial
  private readonly mesh: THREE.Mesh
  private readonly ro: ResizeObserver
  private readonly uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(INIT, INIT) },
  }
  private lastW = 0
  private lastH = 0
  private isDisposed = false

  constructor(container: Element | null) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'ap-sdf-canvas'
    container?.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(INIT, INIT, false)

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: fragSrc('return p.z;'),
      uniforms: this.uniforms,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat)
    this.mesh.frustumCulled = false // quad toàn màn — không để camera cull
    this.scene.add(this.mesh)

    this.ro = new ResizeObserver(() => this._sync())
    this.ro.observe(this.canvas)

    this.renderer.setAnimationLoop(() => {
      this.uniforms.uTime.value = performance.now() / 1000
      this.renderer.render(this.scene, this.camera)
    })
  }

  private _sync(): void {
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    if (cw < 1 || ch < 1) return
    const w = Math.max(40, Math.round(cw))
    const h = Math.max(40, Math.round(ch))
    if (w === this.lastW && h === this.lastH) return
    this.lastW = w
    this.lastH = h
    this.renderer.setSize(w, h, false)
    this.uniforms.uRes.value.set(w, h)
  }

  // Đổi thân bladeSDF (chỉ gọi với body ĐÃ validate OK ở RoofPreview) → recompile shader mini.
  setSDF(body: string): void {
    if (this.isDisposed) return
    this.mat.fragmentShader = fragSrc(body)
    this.mat.needsUpdate = true
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.ro.disconnect()
    this.renderer.setAnimationLoop(null)
    this.mesh.geometry.dispose()
    this.mat.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }
}

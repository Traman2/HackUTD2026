import { useEffect, useRef } from "react";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_r;
uniform float u_t;
uniform vec2 u_m;

vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_r;
  float asp = u_r.x / u_r.y;
  vec2 p = vec2(uv.x * asp * 1.1, uv.y * 1.5);
  float t = u_t * 0.11;

  float n1 = snoise(p * vec2(0.9, 1.7) + vec2(t, -t * 0.7) + u_m * 0.25);
  float n2 = snoise(p * vec2(1.3, 0.9) + vec2(-t * 0.8, t) + 7.1);
  float n3 = snoise(p * vec2(0.7, 1.2) + vec2(t * 0.5, t * 0.4) + 15.3);
  float n4 = snoise(p * vec2(1.6, 1.0) + vec2(t * 0.3, -t * 0.6) + 31.7);

  vec3 base   = vec3(0.969, 0.961, 1.000);
  vec3 violet = vec3(0.388, 0.357, 1.000);
  vec3 pink   = vec3(1.000, 0.510, 0.710);
  vec3 cyan   = vec3(0.250, 0.860, 1.000);
  vec3 amber  = vec3(1.000, 0.720, 0.380);

  vec3 c = base;
  c = mix(c, violet, smoothstep(-0.25, 0.65, n1));
  c = mix(c, pink,   smoothstep(0.00, 0.80, n2) * 0.9);
  c = mix(c, cyan,   smoothstep(0.15, 0.90, n3) * 0.75);
  c = mix(c, amber,  smoothstep(0.35, 0.95, n4) * 0.8);

  // soft sweeping highlight, like light crossing silk
  float sweep = smoothstep(0.0, 1.0, 1.0 - abs(fract(uv.x * 0.8 - uv.y * 0.5 + t * 0.35) - 0.5) * 2.0);
  c += sweep * 0.07;

  // fade toward the left so the headline sits on calm off-white
  float a = mix(0.10, 1.0, smoothstep(0.12, 0.62, uv.x));
  gl_FragColor = vec4(c * a, a);
}
`;

export function GradientBand() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false });
    if (!gl) {
      wrap.classList.add("sx-band--fallback");
      return;
    }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      wrap.classList.add("sx-band--fallback");
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uR = gl.getUniformLocation(prog, "u_r");
    const uT = gl.getUniformLocation(prog, "u_t");
    const uM = gl.getUniformLocation(prog, "u_m");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };

    const resize = () => {
      // Smooth gradients don't need full resolution.
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5;
      const w = Math.max(2, Math.round(wrap.clientWidth * scale));
      const h = Math.max(2, Math.round(wrap.clientHeight * scale));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth - 0.5;
      target.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      cur.x += (target.x - cur.x) * 0.04;
      cur.y += (target.y - cur.y) * 0.04;
      const t = reduce ? 20 : (now - start) / 1000 + 6;
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform2f(uM, cur.x, cur.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div ref={wrapRef} className="sx-band" aria-hidden="true">
      <canvas ref={canvasRef} className="sx-band-canvas" />
      <div className="sx-band-grain" />
    </div>
  );
}

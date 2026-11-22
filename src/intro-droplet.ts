const vertexSource = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`

const fragmentSource = `
precision mediump float;
uniform vec2 uSize;
uniform float uTime;

float shape(vec3 p) {
  p.y += .08;
  float taper = mix(.97, 2.8, smoothstep(-.24, .82, p.y));
  return (length(vec3(p.xz * taper, p.y * .77)) - .66) * .33;
}

vec3 environment(vec3 d) {
  float broad = max(0.0, dot(d, normalize(vec3(-.67, .64, .37))));
  float strip = exp(-36.0 * abs(d.x + d.y * .62 + .32))
    * smoothstep(-.4, .5, d.y);
  float warm = pow(max(0.0, dot(d, normalize(vec3(.73, .32, .44)))), 14.0);
  return mix(vec3(.025, .13, .14), vec3(.14, .49, .43), broad)
    + strip * vec3(.77, 1.0, .86) + warm * vec3(1.0, .65, .29);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uSize) / min(uSize.x, uSize.y);
  if (abs(uv.x) > .59 || abs(uv.y) > .75) { gl_FragColor = vec4(0.0); return; }
  vec3 eye = vec3(0.0, 0.0, 3.2);
  vec3 ray = normalize(vec3(uv, -2.15));
  float travel = 1.75;
  vec3 p;
  float distance = 0.0;
  for (int i = 0; i < 46; i++) {
    p = eye + ray * travel;
    distance = shape(p);
    if (distance < .0025 || travel > 4.1) break;
    travel += distance;
  }
  if (distance > .004 || travel > 4.1) { gl_FragColor = vec4(0.0); return; }
  vec2 e = vec2(.005, 0.0);
  vec3 n = normalize(vec3(shape(p + e.xyy) - shape(p - e.xyy),
                          shape(p + e.yxy) - shape(p - e.yxy),
                          shape(p + e.yyx) - shape(p - e.yyx)));
  float angle = .25 * sin(uTime * 2.4);
  mat2 spin = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec3 reflected = reflect(ray, n);
  reflected.xz = spin * reflected.xz;
  vec3 refracted = refract(ray, n, .7519);
  float fresnel = pow(1.0 - max(0.0, dot(-ray, n)), 3.5);
  float caustic = pow(.5 + .5 * sin(19.0 * (p.y + p.x * p.x) + uTime * 2.8), 7.0);
  float glint = pow(max(0.0, dot(reflected, normalize(vec3(-.54, .57, .60)))), 34.0);
  vec3 transmitted = environment(-refracted) * vec3(.37, .84, .78)
    + vec3(.02, .18, .17) * caustic;
  vec3 color = mix(transmitted, environment(reflected), .2 + fresnel * .74)
    + glint * vec3(.70, .94, .81) + fresnel * vec3(.08, .24, .17);
  gl_FragColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(.79)), 1.0);
}
`

export function createDroplet(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' })
  if (!gl) return null
  const vertex = gl.createShader(gl.VERTEX_SHADER)
  const fragment = gl.createShader(gl.FRAGMENT_SHADER)
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  const dispose = () => {
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    gl.deleteProgram(program)
    gl.deleteBuffer(buffer)
  }
  if (!vertex || !fragment || !program || !buffer) {
    dispose()
    return null
  }
  gl.shaderSource(vertex, vertexSource)
  gl.compileShader(vertex)
  gl.shaderSource(fragment, fragmentSource)
  gl.compileShader(fragment)
  if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) {
    dispose()
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    dispose()
    return null
  }
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'aPosition')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.uniform2f(gl.getUniformLocation(program, 'uSize'), canvas.width, canvas.height)
  const time = gl.getUniformLocation(program, 'uTime')
  return {
    draw(seconds: number) {
      gl.uniform1f(time, seconds)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose,
  }
}

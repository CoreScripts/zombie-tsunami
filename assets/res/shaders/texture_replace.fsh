#ifdef GL_ES
// define default precision for float, vec, mat.
//precision mediump float;
precision highp float;
#endif

varying vec2 v_texCoord;

uniform sampler2D u_texture0;

void main() {
	gl_FragColor = texture2D(u_texture0, v_texCoord);
}

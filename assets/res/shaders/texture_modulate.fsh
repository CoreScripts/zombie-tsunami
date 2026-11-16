#ifdef GL_ES
// define default precision for float, vec, mat.
//precision mediump float;
precision highp float;
#endif

varying vec2 v_texCoord;
#ifdef GL_ES
varying lowp vec4 v_color;

#else
varying vec4 v_color;

#endif

uniform sampler2D u_texture0;

void main() {
	gl_FragColor = v_color * texture2D(u_texture0, v_texCoord);
}

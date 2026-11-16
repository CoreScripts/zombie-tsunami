#ifdef GL_ES
// define default precision for float, vec, mat.
//precision mediump float;
precision highp float;
#endif

varying vec2 v_texCoord0;
varying vec2 v_texCoord1;
#ifdef GL_ES
varying lowp vec4 v_color;

#else
varying vec4 v_color;

#endif

uniform sampler2D u_texture0;
uniform sampler2D u_texture3;

void main() {
    gl_FragColor = v_color * texture2D(u_texture0, v_texCoord0).a * texture2D(u_texture3, v_texCoord1).a;
}

#ifdef GL_ES
attribute mediump vec3 a_position;
attribute highp vec2 a_texCoord0;
attribute lowp vec4 a_color;
uniform mat4 u_modelViewProjection;
varying highp vec2 v_texCoord0;
varying highp vec2 v_texCoord1;
varying lowp vec4 v_color;
uniform float u_maskScaleHeight;

#else
attribute vec3 a_position;
attribute vec2 a_texCoord0;
attribute vec4 a_color;
uniform mat4 u_modelViewProjection;
varying vec2 v_texCoord0;
varying vec2 v_texCoord1;
varying vec4 v_color;
uniform float u_maskScaleHeight;

#endif


void main()
{
	vec4 screen = u_modelViewProjection * vec4(a_position,1);
	v_color = vec4(a_color.rgb * a_color.a, a_color.a);
    v_texCoord0 = a_texCoord0;
    v_texCoord1 = vec2(0.5 + 0.5 * screen.x, (0.5 - 0.5 * screen.y) * u_maskScaleHeight);
	gl_Position = screen;
}


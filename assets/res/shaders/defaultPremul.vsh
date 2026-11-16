#ifdef GL_ES
attribute highp vec3 a_position;
//attribute mediump vec2 a_texCoord0;
attribute highp vec2 a_texCoord0;
attribute lowp vec4 a_color;
uniform mat4 u_modelViewProjection;
//varying mediump vec2 v_texCoord;
varying highp vec2 v_texCoord;
varying lowp vec4 v_color;

#else
attribute vec3 a_position;
attribute vec2 a_texCoord0;
attribute vec4 a_color;
uniform mat4 u_modelViewProjection;
varying vec2 v_texCoord;
varying vec4 v_color;

#endif


void main()
{
	v_color = vec4(a_color.rgb * a_color.a, a_color.a);
	v_texCoord = a_texCoord0;
	gl_Position = u_modelViewProjection * vec4(a_position,1);
}


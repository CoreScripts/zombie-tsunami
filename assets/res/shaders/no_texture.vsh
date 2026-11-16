#ifdef GL_ES
attribute highp vec3 a_position;
//attribute mediump vec2 a_texCoord0;

attribute lowp vec4 a_color;
uniform mat4 u_modelViewProjection;
//varying mediump vec2 v_texCoord;
varying lowp vec4 v_color;

#else
attribute vec3 a_position;
attribute vec4 a_color;
uniform mat4 u_modelViewProjection;
varying vec4 v_color;

#endif


void main()
{
	v_color = a_color;
	gl_Position = u_modelViewProjection * vec4(a_position,1);
}


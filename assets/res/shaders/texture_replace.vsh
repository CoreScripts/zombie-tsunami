#ifdef GL_ES
attribute highp vec3 a_position;
attribute highp vec2 a_texCoord0;
uniform mat4 u_modelViewProjection;
varying highp vec2 v_texCoord;
#else
attribute vec3 a_position;
attribute vec2 a_texCoord0;
uniform mat4 u_modelViewProjection;
varying vec2 v_texCoord;

#endif


void main()
{
	v_texCoord = a_texCoord0;
	gl_Position = u_modelViewProjection * vec4(a_position,1);
}


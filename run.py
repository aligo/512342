import glfw
import OpenGL.GL as gl
import numpy as np
import ctypes
import mss
import cv2
import time
import sys
import pyautogui

VERTEX_SHADER_SRC = open("crt_mac.vert").read()
FRAGMENT_SHADER_SRC = open("crt_mac.frag").read()

def compile_shader(source, shader_type):
    shader = gl.glCreateShader(shader_type)
    gl.glShaderSource(shader, source)
    gl.glCompileShader(shader)
    if not gl.glGetShaderiv(shader, gl.GL_COMPILE_STATUS):
        raise RuntimeError(gl.glGetShaderInfoLog(shader).decode())
    return shader

def create_program(vertex_src, fragment_src):
    vs = compile_shader(vertex_src, gl.GL_VERTEX_SHADER)
    fs = compile_shader(fragment_src, gl.GL_FRAGMENT_SHADER)
    program = gl.glCreateProgram()
    gl.glAttachShader(program, vs)
    gl.glAttachShader(program, fs)
    gl.glLinkProgram(program)
    if not gl.glGetProgramiv(program, gl.GL_LINK_STATUS):
        raise RuntimeError(gl.glGetProgramInfoLog(program).decode())
    gl.glDeleteShader(vs)
    gl.glDeleteShader(fs)
    return program

def key_callback(window, key, scancode, action, mods):
    if key == glfw.KEY_W and mods == glfw.MOD_SUPER and action == glfw.PRESS:
        glfw.set_window_should_close(window, True)

def draw_cursor_on_image(img, monitor, xpos, ypos):
    img_height, img_width, _ = img.shape
    x_img = int((xpos - monitor['left']) / monitor['width'] * img_width)
    y_img = int((ypos - monitor['top']) / monitor['height'] * img_height)

    dot_size = int(monitor["width"] * 0.003)
    cv2.circle(img, (x_img, y_img), dot_size + 1, (255, 255, 255), -1)
    cv2.circle(img, (x_img, y_img), dot_size, (0, 0, 0), -1)

def main():
    if not glfw.init():
        raise RuntimeError("GLFW init failed")

    sct = mss.mss(with_cursor=False)
    source_type = sys.argv[1] if len(sys.argv) > 1 else "monitor"
    src_index = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0

    if source_type == "monitor":
        monitor = sct.monitors[src_index]
        width, height = monitor["width"], monitor["height"]
    elif source_type == "camera":
        cap = cv2.VideoCapture(src_index)
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(
            cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        )
        if not cap.isOpened():
            raise RuntimeError("Cannot open camera")

    window_width = int(width * scale)
    window_height = int(height * scale)

    glfw.window_hint(glfw.CONTEXT_VERSION_MAJOR, 3)
    glfw.window_hint(glfw.CONTEXT_VERSION_MINOR, 3)
    glfw.window_hint(glfw.OPENGL_PROFILE, glfw.OPENGL_CORE_PROFILE)
    glfw.window_hint(glfw.DECORATED, glfw.TRUE)
    window = glfw.create_window(window_width, window_height, "512342", None, None)
    glfw.make_context_current(window)

    program = create_program(VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC)

    vertices = np.array([
        -1, -1,  0, 0,
         1, -1,  1, 0,
         1,  1,  1, 1,
        -1,  1,  0, 1,
    ], dtype=np.float32)
    indices = np.array([0, 1, 2, 0, 2, 3], dtype=np.uint32)

    vao = gl.glGenVertexArrays(1)
    vbo = gl.glGenBuffers(1)
    ebo = gl.glGenBuffers(1)

    gl.glBindVertexArray(vao)
    gl.glBindBuffer(gl.GL_ARRAY_BUFFER, vbo)
    gl.glBufferData(gl.GL_ARRAY_BUFFER, vertices.nbytes, vertices, gl.GL_STATIC_DRAW)
    gl.glBindBuffer(gl.GL_ELEMENT_ARRAY_BUFFER, ebo)
    gl.glBufferData(gl.GL_ELEMENT_ARRAY_BUFFER, indices.nbytes, indices, gl.GL_STATIC_DRAW)
    gl.glVertexAttribPointer(0, 2, gl.GL_FLOAT, False, 16, ctypes.c_void_p(0))
    gl.glEnableVertexAttribArray(0)
    gl.glVertexAttribPointer(1, 2, gl.GL_FLOAT, False, 16, ctypes.c_void_p(8))
    gl.glEnableVertexAttribArray(1)

    texture = gl.glGenTextures(1)
    gl.glBindTexture(gl.GL_TEXTURE_2D, texture)
    gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_MIN_FILTER, gl.GL_LINEAR)
    gl.glTexParameteri(gl.GL_TEXTURE_2D, gl.GL_TEXTURE_MAG_FILTER, gl.GL_LINEAR)
    start_time = time.time()

    glfw.set_key_callback(window, key_callback)

    while not glfw.window_should_close(window):
        if source_type == "monitor":
            raw = sct.grab(monitor)
            img = np.array(raw)
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2RGB)
            img = cv2.resize(img, (width, height)).astype(np.uint8).copy(order="C")
            xpos, ypos = pyautogui.position()
            draw_cursor_on_image(img, monitor, xpos, ypos)
        elif source_type == "camera":
            ret, img = cap.read()
            if not ret:
                raise RuntimeError("Failed to grab frame from camera")
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = cv2.resize(img, (width, height)).astype(np.uint8).copy(order="C")

        gl.glBindTexture(gl.GL_TEXTURE_2D, texture)
        gl.glTexImage2D(gl.GL_TEXTURE_2D, 0, gl.GL_RGB, width, height, 0,
                        gl.GL_RGB, gl.GL_UNSIGNED_BYTE, img)

        gl.glClear(gl.GL_COLOR_BUFFER_BIT)
        gl.glUseProgram(program)

        gl.glUniform1i(gl.glGetUniformLocation(program, "Texture"), 0)
        gl.glUniform2f(gl.glGetUniformLocation(program, "Size"), width, height)
        gl.glUniform1i(gl.glGetUniformLocation(program, "FrameCount"), int((time.time() - start_time) * 60))
        gl.glUniform1i(gl.glGetUniformLocation(program, "FrameDirection"), 1)

        gl.glBindVertexArray(vao)
        gl.glDrawElements(gl.GL_TRIANGLES, 6, gl.GL_UNSIGNED_INT, None)

        glfw.swap_buffers(window)
        glfw.poll_events()

    if source_type == "camera":
        cap.release()
    glfw.terminate()

if __name__ == "__main__":
    main()

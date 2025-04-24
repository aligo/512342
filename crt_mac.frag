#version 330 core

in vec2 uv;
out vec4 fragColor;

uniform sampler2D Texture;
uniform int FrameCount;
uniform int FrameDirection;

uniform vec2 Size;

const float d = 1.6;
const float curvature = 1.0;
const float curvature_radius = 2.4;
const float cornersize = 0.04;
const float cornersmooth = 150.0;
const float x_tilt = 0.0;
const float y_tilt = 0.0;
const float overscan_x = 99.5;
const float overscan_y = 99.5;

const float sharper = 1.2;
const float chromatic_aberration = 0.1;
const float saturation = 1.2;
const float contrast = 1.1;
const float gamma = 2.6;
const float lum = 1.3;
const float brightness = 1.4;

const int crt_width = 512;
const int crt_height = 342;

const int dotmask_count_h = crt_width * 3;
const int dotmask_count_v = crt_height;
const float dotmask_amount = 0.25;

const int grille_count_h = crt_width;
const float grille_amplitude = 1.3;
const float grille_step_ratio = 0.9;
const float interlace_detect = 1.001;

const int scanline_count_v = crt_height;
const float scanline_weight = 0.005;
const float scanline_motion = -60;

#define FIX(c) max(abs(c), 1e-5)
#define PI 3.141592653589

vec2 sinangle = sin(vec2(x_tilt, y_tilt)) + vec2(0.001);
vec2 cosangle = cos(vec2(x_tilt, y_tilt)) + vec2(0.001);

float corner(vec2 coord) {
    coord = (coord - vec2(0.5)) * vec2(overscan_x / 100.0, overscan_y / 100.0) + vec2(0.5);
    coord = min(coord, vec2(1.0) - coord) * vec2(1.0, 0.75);
    vec2 cdist = vec2(cornersize);
    coord = cdist - min(coord, cdist);
    float dist = sqrt(dot(coord, coord));
    return clamp((cdist.x - dist) * cornersmooth, 0.0, 1.0) * 1.0001;
}

vec2 bkwtrans(vec2 xy) {
    float A = dot(xy, xy) + d * d;
    float B = 2.0 * (curvature_radius * (dot(xy, sinangle) - d * cosangle.x * cosangle.y) - d * d);
    float C = d * d + 2.0 * curvature_radius * d * cosangle.x * cosangle.y;
    float c = (-B - sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
    vec2 point = c * xy - (-curvature_radius) * sinangle;
    point /= curvature_radius;
    vec2 tang = sinangle / cosangle;
    vec2 poc = point / cosangle;
    float a = (-2.0 * dot(poc, tang) + sqrt(pow(2.0 * dot(poc, tang), 2.0) - 4.0 * (dot(tang, tang) + 1.0) * (dot(poc, poc) - 1.0))) / (2.0 * (dot(tang, tang) + 1.0));
    vec2 uv = (point - a * sinangle) / cosangle;
    float r = curvature_radius * acos(a);
    return uv * r / sin(r / curvature_radius);
}

vec2 transform(vec2 coord) {
    float center_dist = length(coord - vec2(0.5));
    if (center_dist < 0.02) {
        return coord;
    }
    coord *= Size / Size;
    coord = (coord - vec2(0.5)) * vec2(1.0, 0.75) + vec2(0.0);
    return (bkwtrans(coord) / vec2(overscan_x / 100.0, overscan_y / 100.0) / vec2(1.0, 0.75) + vec2(0.5)) * Size / Size;
}

float PHI = 1.61803398874989484820459; 

float random(in vec2 xy, in float seed){
       return fract(tan(distance(xy*PHI, xy)*seed)*xy.x);
}

void main() {
    vec2 flipped_uv = vec2(uv.x, 1.0 - uv.y);
    float interlace_factor = interlace_detect * 0.5 * (1.0 / Size.y);
    vec2 ilvec = vec2(0.0, mod(float(FrameCount), 2.0) * interlace_factor);
    
    vec2 pos = ((curvature_radius > 0.5) ? transform(flipped_uv) : flipped_uv);
    
    pos += ilvec * interlace_detect;

    if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0) {
        fragColor = vec4(0.0);
        return;
    }

    vec2 texel = vec2(1.0) / Size;
    vec3 color = texture(Texture, pos).rgb;

    color = pow(max(color, vec3(0.01)), vec3(1.0 / max(gamma, 1.0)));

    float l = length(color) * 0.5775;
    vec3 lum_weight = vec3(0.3, 0.6, 0.1);
    if (l < 0.5) {
        lum_weight *= lum_weight;
    }
    float gray = dot(color, lum_weight);
    
    color = mix(vec3(gray), color, saturation);

    color = (color - 0.5) * contrast + 0.5;

    color = pow(color, vec3(1.0 / lum));
    
    color = clamp(color, 0.0, 1.0);

    float center_dist = length(pos - vec2(0.5));
    float aberration_offset = chromatic_aberration * center_dist / 100.0;
    vec2 aberration_vec = vec2(aberration_offset, 0.0);
    vec3 color_r = texture(Texture, pos + aberration_vec).rgb;
    vec3 color_g = texture(Texture, pos).rgb;
    vec3 color_b = texture(Texture, pos - aberration_vec).rgb;
    color = vec3(color_r.r, color_g.g, color_b.b);

    if (sharper > 1.0) {
        vec3 left = texture(Texture, pos - vec2(texel.x, 0.0)).rgb;
        vec3 right = texture(Texture, pos + vec2(texel.x, 0.0)).rgb;
        vec3 top = texture(Texture, pos - vec2(0.0, texel.y)).rgb;
        vec3 bottom = texture(Texture, pos + vec2(0.0, texel.y)).rgb;
        
        vec3 laplacian = 4.0 * color - (left + right + top + bottom);
        
        float strength = (sharper - 1.0) * 0.5;
        color = color + laplacian * strength;
    }

    float calculated_scanline_frequency = float(scanline_count_v) / Size.y;
    float scan_offset = float(FrameCount) * scanline_motion;
    float scan = sin(pos.y * Size.y * calculated_scanline_frequency + scan_offset) * scanline_weight;
    
    float calculated_grille_frequency = float(grille_count_h) / Size.x;
    float grille_pattern = fract(pos.x * Size.x * calculated_grille_frequency);
    float color_avg = (color.r + color.g + color.b) / 3.0;
    float grille_step = grille_step_ratio * color_avg;
    float grille = step(grille_step, grille_pattern) * grille_amplitude;
    
    float pattern_effect = min(scan, grille);
    color -= vec3(pattern_effect);

    color = clamp(color, 0.0, 1.0);
    color *= brightness;

    float x_ratio = pos.x * float(dotmask_count_h);
    float y_ratio = pos.y * float(dotmask_count_v);
    
    float dot_x = floor(x_ratio);
    float dot_y = floor(y_ratio);

    float dot_x_phase = mod(dot_x, 3.0);
    float dot_x_phase_odd = mod(float(dot_x / 3), 2.0);
    float dot_y_phase = mod(dot_y + dot_x_phase_odd, 2.0);

    vec3 dotmask;
    if (dot_x_phase < 1.0) {
        dotmask = vec3(1.0, 1.0 - dotmask_amount, 1.0 - dotmask_amount); // 红色
    } else if (dot_x_phase < 2.0) {
        dotmask = vec3(1.0 - dotmask_amount, 1.0, 1.0 - dotmask_amount); // 绿色
    } else {
        dotmask = vec3(1.0 - dotmask_amount, 1.0 - dotmask_amount, 1.0); // 蓝色
    }
    if (dot_y_phase < 1.0) {
        dotmask *= vec3(1.0 - dotmask_amount / 2);
    }

    float jitter = (random(gl_FragCoord.xy, mod(FrameCount, l)) - 0.5) * 0.2;
    color *= dotmask + jitter;

    color = clamp(color, 0.0, 1.0);
    
    color = max(color, vec3(0.05));
    
    float cval = corner(pos);
    color *= cval;

    fragColor = vec4(color, 1.0);
}

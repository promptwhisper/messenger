import {
  ClampToEdgeWrapping,
  Color,
  MeshPhongMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";

export interface MessengerMaterialOptions {
  character?: boolean;
  fog?: boolean;
  terrainNoise?: Texture;
  terrainDetail?: Texture;
}

export function configureMessengerAtlas(texture: Texture): Texture {
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Clean-room equivalent of the reference's shared atlas material. It keeps the
 * authored colour atlas intact, compresses the direct light into a painted
 * light/shadow pair, and applies the two-colour exponential fog in material
 * space so the sky remains unaffected.
 */
export function createMessengerMaterial(
  atlas: Texture,
  { character = false, fog = true, terrainNoise, terrainDetail }: MessengerMaterialOptions = {}
): MeshPhongMaterial {
  configureMessengerAtlas(atlas);
  if (terrainNoise) {
    terrainNoise.wrapS = terrainNoise.wrapT = RepeatWrapping;
    terrainNoise.needsUpdate = true;
  }
  if (terrainDetail) {
    terrainDetail.wrapS = terrainDetail.wrapT = RepeatWrapping;
    terrainDetail.needsUpdate = true;
  }

  const material = new MeshPhongMaterial({
    map: atlas,
    color: 0xffffff,
    specular: character ? 0x000000 : 0xffffff,
    shininess: character ? 1 : 24,
  });
  material.fog = fog;
  material.customProgramCacheKey = () =>
    `messenger-base-${character ? "character" : "world"}-${terrainNoise ? "terrain" : "plain"}-${fog ? "fog" : "clear"}`;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uMessengerFogNear = { value: new Color("#93a2bf") };
    shader.uniforms.uMessengerFogFar = { value: new Color("#9ea7b8") };
    if (terrainNoise && terrainDetail) {
      shader.uniforms.uMessengerTerrainNoise = { value: terrainNoise };
      shader.uniforms.uMessengerTerrainDetail = { value: terrainDetail };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vMessengerWorldPosition;"
        )
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvMessengerWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;"
        );
    }

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "uniform vec3 uMessengerFogNear;",
        "uniform vec3 uMessengerFogFar;",
        terrainNoise && terrainDetail
          ? "uniform sampler2D uMessengerTerrainNoise;\nuniform sampler2D uMessengerTerrainDetail;\nvarying vec3 vMessengerWorldPosition;"
          : "",
        "vec3 messengerRgbToHsv(vec3 c) {",
        "  vec4 K = vec4(0.0, -0.3333333333, 0.6666666667, -1.0);",
        "  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));",
        "  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));",
        "  float d = q.x - min(q.w, q.y);",
        "  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);",
        "}",
        "vec3 messengerHsvToRgb(vec3 c) {",
        "  vec3 p = abs(fract(c.xxx + vec3(0.0, 0.6666666667, 0.3333333333)) * 6.0 - 3.0);",
        "  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);",
        "}",
      ].join("\n")
    );

    if (terrainNoise && terrainDetail) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "vec3 terrainP = vMessengerWorldPosition * 0.035;",
          "float terrainBroad = texture2D(uMessengerTerrainNoise, terrainP.xz).r;",
          "float terrainFine = texture2D(uMessengerTerrainDetail, terrainP.zy * 2.1 + terrainBroad * 0.13).g;",
          "float terrainPigment = mix(0.91, 1.045, terrainBroad * 0.68 + terrainFine * 0.32);",
          "diffuseColor.rgb *= terrainPigment;",
        ].join("\n")
      );
    }

    const low = character ? "0.10" : "0.20";
    const high = character ? "0.15" : "0.40";
    shader.fragmentShader = shader.fragmentShader.replace(
        "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;",
        [
          "float messengerShadowMask = 1.0;",
          "#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0",
          "  DirectionalLightShadow messengerDirectionalShadow = directionalLightShadows[0];",
          "  messengerShadowMask = getShadow(",
          "    directionalShadowMap[0],",
          "    messengerDirectionalShadow.shadowMapSize,",
          "    messengerDirectionalShadow.shadowIntensity,",
          "    messengerDirectionalShadow.shadowBias,",
          "    messengerDirectionalShadow.shadowRadius,",
          "    vDirectionalShadowCoord[0]",
          "  );",
          "#endif",
          `float messengerLit = smoothstep(${low}, ${high}, messengerShadowMask);`,
          "vec3 messengerHsv = messengerRgbToHsv(diffuseColor.rgb);",
          "messengerHsv.x = fract(messengerHsv.x - 0.02);",
          "messengerHsv.z *= 0.5;",
          "vec3 messengerShadowColor = messengerHsvToRgb(messengerHsv);",
          "vec3 outgoingLight = mix(messengerShadowColor, diffuseColor.rgb, messengerLit)",
          "  + reflectedLight.indirectDiffuse + reflectedLight.directSpecular * 0.075",
          "  + reflectedLight.indirectSpecular + totalEmissiveRadiance;",
        ].join("\n")
      );
    if (fog) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <fog_fragment>",
        [
          "float messengerDistance = length(vViewPosition);",
          "float messengerFog = 1.0 - exp(-0.011 * 0.011 * messengerDistance * messengerDistance);",
          "vec3 messengerFogColor = mix(uMessengerFogNear, uMessengerFogFar, smoothstep(0.0, 0.8, messengerFog));",
          "gl_FragColor.rgb = mix(gl_FragColor.rgb, messengerFogColor, messengerFog);",
        ].join("\n")
      );
    }
    material.userData.shader = shader;
  };
  return material;
}

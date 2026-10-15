"use strict";
(() => {
  const isEgypt = () => trackKey === 'egypt';
  const oldGrass = gfxGrassTexture, oldMowing = buildMowing;
  const oldExtras = buildExtras, oldLandmark = buildLandmark;
  const oldSky = skyTexture;
  // Panorama toon de la côte égyptienne et de Mohamed Salah, utilisée uniquement pour l'Égypte.
  // L'image est gardée dans assets/ afin de fonctionner avec GitHub Pages sans service externe.
  let horizonImage = null;
  let horizonLoadStarted = false;

const loadEgyptHorizon = () => {
  if (horizonLoadStarted) return;
  horizonLoadStarted = true;

  const img = new Image();

  // À configurer avant img.src.
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    horizonImage = img;

    if (
      isEgypt() &&
      typeof scene !== 'undefined' &&
      scene &&
      typeof sky !== 'undefined' &&
      sky &&
      sky.material
    ) {
      const texture = egyptHorizonTexture();

      if (texture) {
        if (sky.material.map) {
          sky.material.map.dispose();
        }

        sky.material.map = texture;
        sky.material.needsUpdate = true;
      }
    }
  };

  img.onerror = () => {
    console.warn(
      'Fond Égypte indisponible ou refusé par CORS :',
      img.src
    );
  };

  img.src = new URL(
    './assets/egypt-horizon.png',
    document.baseURI
  ).href;
};

  const egyptHorizonTexture = () => {
    if (!horizonImage || !horizonImage.complete || !horizonImage.naturalWidth) return null;
    const tex = new THREE.Texture(horizonImage);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = typeof maxAniso !== 'undefined' ? maxAniso : 1;
    tex.needsUpdate = true;
    return tex;
  };
  loadEgyptHorizon();
  gfxGrassTexture = function (...args) { return isEgypt() ? gfxSandTexture() : oldGrass(...args); };
  buildMowing = function (...args) { if (!isEgypt()) return oldMowing(...args); };
  buildLandmark = function (...args) { if (!isEgypt()) return oldLandmark(...args); };
  skyTexture = function (m) {
    if (isEgypt()) {
      const panorama = egyptHorizonTexture();
      if (panorama) return panorama;
      return oldSky({...m, hills: ['rgba(184,139,85,.7)','rgba(148,105,65,.85)']});
    }
    return oldSky(m);
  };
  function egyptDecor() {
    const xs=Array.from(TX), zs=Array.from(TZ);
    const x0=Math.min(...xs), x1=Math.max(...xs), z0=Math.min(...zs), z1=Math.max(...zs);
    const cz=(z0+z1)/2, coast=x1+105, groundY=GROUND_Y;
    // Remove only the three procedural forest meshes; cars and spectators are not touched.
    for (const o of [...scene.children]) {
      if (o.isInstancedMesh && ['CylinderGeometry','ConeGeometry','IcosahedronGeometry'].includes(o.geometry?.type)) {
        scene.remove(o); o.geometry.dispose();
        const mats=Array.isArray(o.material)?o.material:[o.material]; mats.forEach(m=>m.dispose());
      }
      if (o.isMesh && o.geometry?.type==='PlaneGeometry' && o.geometry.parameters.width===8000 && o.geometry.parameters.height===8000) {
        o.geometry.dispose(); o.geometry=new THREE.PlaneGeometry(8000,8000);
        o.position.x=coast-4000; o.material.color.setHex(0xe9c68a);
      }
    }
    const root=new THREE.Group();root.name='Egypt desert coast';scene.add(root);
    const stone=new THREE.MeshStandardMaterial({color:0xd4ac70,roughness:1,flatShading:true});
    const lighter=new THREE.MeshStandardMaterial({color:0xe6c995,roughness:1});
    const dark=new THREE.MeshStandardMaterial({color:0x59432e,roughness:1});
    const add=(geo,mat,x,y,z,parent=root)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
    const pyramid=(x,z,w,h)=>{
      const g=new THREE.Group();g.position.set(x,groundY,z);root.add(g);
      const p=add(new THREE.ConeGeometry(w/Math.sqrt(2),h,4),stone,0,h/2,0,g);p.rotation.y=Math.PI/4;
      for(let y=4;y<h;y+=5){const half=w/2*(1-y/h),v=[-half,y,-half,half,y,-half,half,y,half,-half,y,half,-half,y,-half];
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
        g.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xb88f58,transparent:true,opacity:.48})));}
    };
    // All monuments stand outside the complete track bounding box, on the desert side.
    pyramid(x0-150,cz-150,140,94);pyramid(x0-260,cz+30,112,76);pyramid(x0-150,cz+185,78,53);
    const sphinx=new THREE.Group();sphinx.position.set(x0-78,groundY,cz);sphinx.rotation.y=Math.PI/2;root.add(sphinx);
    add(new THREE.BoxGeometry(26,2,58),stone,0,1,0,sphinx);
    const body=add(new THREE.SphereGeometry(1,16,10),stone,0,10,0,sphinx);body.scale.set(10,9,22);
    [-7,7].forEach(x=>add(new THREE.BoxGeometry(6,4,27),lighter,x,4,21,sphinx));
    add(new THREE.BoxGeometry(10,13,9),lighter,0,22,16,sphinx);
    const crown=add(new THREE.SphereGeometry(1,14,10),stone,0,25,14,sphinx);crown.scale.set(9,11,6);
    add(new THREE.BoxGeometry(3,4,3),lighter,0,23,22,sphinx);
    [-2.6,2.6].forEach(x=>add(new THREE.BoxGeometry(2,.7,.4),dark,x,25,20.8,sphinx));
    add(new THREE.BoxGeometry(2,5,2),stone,0,17,21,sphinx);
    // Sea starts beyond the circuit and pit clearance, never on the racing surface.
    const water=new THREE.MeshStandardMaterial({color:0x08668d,roughness:.28,metalness:.32});
    const sea=add(new THREE.PlaneGeometry(8000,8000,1,1),water,coast+4000,groundY-.6,cz);sea.rotation.x=-Math.PI/2;sea.castShadow=false;
    const shore=add(new THREE.PlaneGeometry(50,8000),new THREE.MeshStandardMaterial({color:0x23c6cd,roughness:.4}),coast+25,groundY-.55,cz);shore.rotation.x=-Math.PI/2;shore.castShadow=false;
    const foamMat=new THREE.MeshBasicMaterial({color:0xc9f8ef,transparent:true,opacity:.6});
    for(let k=0;k<70;k++){
      const wave=add(new THREE.PlaneGeometry(1.2,12+(k%5)*3),foamMat,coast+3+(k%3)*4,groundY-.5,cz-1500+k*43);wave.rotation.x=-Math.PI/2;wave.castShadow=false;
    }
    let seed=47;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
    for(let k=0;k<28;k++){
      const rock=add(new THREE.IcosahedronGeometry(8+rand()*12,0),stone,x0-100-rand()*380,groundY+3,z0-150+rand()*(z1-z0+300));rock.scale.set(1,.45+rand()*.7,.7+rand());
    }
  }
  buildExtras = function (...args) {
    if (!isEgypt()) return oldExtras(...args);
    egyptDecor();
    return oldExtras(...args);
  };
  if (typeof scene !== 'undefined' && scene && typeof renderer !== 'undefined' && renderer && isEgypt()) setTrack(trackKey);
})();

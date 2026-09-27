import * as THREE from "three";

export interface Flight {
  start: number;
  duration: number;
  count: number;
  direction: number;
  altitude: number;
  seed: number;
}

// Time is the scene's animation clock: pausing or hiding the page also pauses arrivals.
export function createFlightSchedule(random: () => number = Math.random) {
  let next = 12 + random() * 12;
  let flight: Flight | null = null;
  return (time: number): Flight | null => {
    if (flight && time >= flight.start + flight.duration) {
      flight = null;
      next = time + 55 + random() * 65;
    }
    if (!flight && time >= next) {
      flight = {
        start: time,
        duration: 18 + random() * 10,
        count: 2 + Math.floor(random() * 5),
        direction: random() > 0.5 ? 1 : -1,
        altitude: 0.84 + random() * 0.075,
        seed: random() * 100,
      };
    }
    return flight;
  };
}

export function gooseVertices(flap: number): Float32Array {
  const vertices: number[] = [];
  const polygon = (points: number[][]) => {
    for (let i = 1; i < points.length - 1; i++) {
      for (const point of [points[0], points[i], points[i + 1]])
        vertices.push(point[0], point[1], 0);
    }
  };
  // Body, extended neck and head; two jointed wings change silhouette on every beat.
  polygon([
    [-0.48, -0.02],
    [-0.18, 0.12],
    [0.28, 0.1],
    [0.64, 0.25],
    [0.87, 0.18],
    [0.64, 0.12],
    [0.12, -0.1],
  ]);
  polygon([
    [-0.07, 0.03],
    [-0.35, flap * 0.55 + 0.12],
    [-0.95, flap * 0.9],
    [-0.35, flap * 0.3 - 0.04],
  ]);
  polygon([
    [0.02, 0.02],
    [0.4, flap * 0.5 + 0.03],
    [0.75, flap * 0.85],
    [0.1, flap * 0.2 - 0.1],
  ]);
  return new Float32Array(vertices);
}

export function createGeese(
  scene: THREE.Scene,
  schedule = createFlightSchedule(),
) {
  const material = new THREE.MeshBasicMaterial({
    color: "#29434f",
    transparent: true,
    opacity: 0.74,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const birds = Array.from({ length: 6 }, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(gooseVertices(0), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1.5;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  return {
    update(time: number, width: number, height: number) {
      const flight = schedule(time);
      birds.forEach((bird, index) => {
        bird.visible = !!flight && index < flight.count;
        if (!flight || !bird.visible) return;
        const progress = (time - flight.start) / flight.duration;
        const rank = Math.ceil(index / 2),
          side = index % 2 ? 1 : -1;
        const individuality = Math.sin(flight.seed + index * 23.7);
        const flockX =
          flight.direction === 1
            ? -0.16 + progress * 1.38
            : 1.16 - progress * 1.38;
        const trail = (rank * (25 + individuality * 4)) / width;
        const x = flockX - flight.direction * trail;
        const y =
          flight.altitude +
          (rank * side * 12) / height +
          Math.sin(progress * Math.PI) * 0.015 +
          Math.sin(time * 0.6 + index) * 0.0018;
        const size = 5 + (individuality + 1) * 0.65;
        const phase =
          time * (4.5 + individuality * 0.3) + index * 1.3 + flight.seed;
        // Short glide intervals interrupt the wingbeats, independently for each goose.
        const glide = Math.sin(time * 0.42 + index * 1.8) > 0.72;
        const flap = glide ? 0.18 : Math.sin(phase);
        const position = bird.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        (position.array as Float32Array).set(gooseVertices(flap));
        position.needsUpdate = true;
        bird.position.set((x * 2 - 1) * 1.055, (y * 2 - 1) * 1.055, 0);
        bird.scale.set(
          (flight.direction * size * 2) / width,
          (size * 2) / height,
          1,
        );
      });
    },
    dispose() {
      birds.forEach((bird) => {
        scene.remove(bird);
        bird.geometry.dispose();
      });
      material.dispose();
    },
  };
}

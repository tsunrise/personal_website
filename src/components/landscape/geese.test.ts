import * as THREE from "three";
import { createFlightSchedule, createGeese } from "./geese";

it("leaves a long quiet interval between flocks and never overlaps them", () => {
  const schedule = createFlightSchedule(() => 0.5);
  expect(schedule(0)).toBeNull();
  expect(schedule(17)).toBeNull();
  const first = schedule(18)!;
  expect(first.count).toBe(4);
  expect(schedule(25)).toBe(first);
  expect(schedule(first.start + first.duration)).toBeNull();
  expect(schedule(100)).toBeNull();
  const second = schedule(129)!;
  expect(second).not.toBe(first);
  expect(second.start).toBe(129);
});

it("varies arrival, group size, direction and duration with randomness", () => {
  const early = createFlightSchedule(() => 0);
  const late = createFlightSchedule(() => 0.999);
  expect(early(12)).toMatchObject({ count: 2, direction: -1, duration: 18 });
  expect(late(12)).toBeNull();
  expect(late(24)).toMatchObject({ count: 6, direction: 1 });
  expect(late(24)!.duration).toBeGreaterThan(27);
});

it("animates wings, preserves a flock across scene resize, and releases resources", () => {
  const scene = new THREE.Scene();
  const schedule = createFlightSchedule(() => 0.5);
  let geese = createGeese(scene, schedule);
  geese.update(18, 1000, 800);
  const first = scene.children[0] as THREE.Mesh;
  const positions = Array.from(first.geometry.getAttribute("position").array);
  geese.update(21, 1000, 800);
  expect(Array.from(first.geometry.getAttribute("position").array)).not.toEqual(
    positions,
  );
  expect(scene.children.filter((bird) => bird.visible)).toHaveLength(4);
  const geometryDispose = jest.spyOn(first.geometry, "dispose");
  const materialDispose = jest.spyOn(
    first.material as THREE.Material,
    "dispose",
  );
  geese.dispose();
  expect(scene.children).toHaveLength(0);
  expect(geometryDispose).toHaveBeenCalledTimes(1);
  expect(materialDispose).toHaveBeenCalledTimes(1);
  geese = createGeese(scene, schedule);
  geese.update(30, 400, 800);
  expect(schedule(30)!.start).toBe(18);
  geese.update(42, 400, 800);
  expect(scene.children.every((bird) => !bird.visible)).toBe(true);
  geese.dispose();
});

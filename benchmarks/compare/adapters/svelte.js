import { mount, unmount } from "svelte";
import AttributeFanout from "../svelte/AttributeFanout.svelte";
import FormInput from "../svelte/FormInput.svelte";
import InitialRows from "../svelte/InitialRows.svelte";
import KeyedReverse from "../svelte/KeyedReverse.svelte";
import MountMany from "../svelte/MountMany.svelte";
import TextFanout from "../svelte/TextFanout.svelte";

export const svelteAdapter = {
  name: "Svelte",

  initialRows(target, rows) {
    const component = mount(InitialRows, { target, props: { rows } });
    unmount(component);
  },

  async textFanout(target, count, updates) {
    const component = mount(TextFanout, { target, props: { count } });
    await component.run(updates);
    unmount(component);
  },

  async attributeFanout(target, count, updates) {
    const component = mount(AttributeFanout, { target, props: { count } });
    await component.run(updates);
    unmount(component);
  },

  async keyedReverse(target, rows) {
    const component = mount(KeyedReverse, { target, props: { rows } });
    await component.reverse();
    unmount(component);
  },

  async formInput(target, count) {
    const component = mount(FormInput, { target });
    const value = await component.run(count);
    if (value !== `value-${count - 1}`) {
      throw new Error("Svelte input state did not update");
    }
    unmount(component);
  },

  mountUnmount(target, loops) {
    for (let i = 0; i < loops; i++) {
      const component = mount(MountMany, { target, props: { iteration: i } });
      unmount(component);
    }
  }
};

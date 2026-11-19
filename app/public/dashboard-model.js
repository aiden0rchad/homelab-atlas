import { isValidLink } from './model.js';
import { DEFAULT_PROJECT_STORAGE_KEY, decodeStoredProject, PROJECT_STORAGE_KEY } from './project-storage.js';

export { decodeStoredProject };
export const DASHBOARD_STORAGE_KEY = PROJECT_STORAGE_KEY;
export const DASHBOARD_DEFAULT_KEY = DEFAULT_PROJECT_STORAGE_KEY;

export function dashboardStats(project) {
  let services = 0;
  let links = 0;
  for (const device of project.devices) {
    for (const group of device.groups) {
      for (const service of group.services) {
        services += 1;
        if (isValidLink(service.link)) links += 1;
      }
    }
  }
  return { hosts: project.devices.length, services, links };
}

export function serviceLinks(project) {
  const links = new Map();
  for (const device of project.devices) {
    for (const group of device.groups) {
      for (const service of group.services) {
        if (isValidLink(service.link)) links.set(service.id, { href: service.link, name: service.name, device: device.name, group: group.name });
      }
    }
  }
  return links;
}

---
layout: home
title: Homelab Atlas Documentation
titleTemplate: false

hero:
  name: Homelab Atlas
  text: Make a diagram of your homelab.
  tagline: Add your machines and apps, review Docker or Nmap findings, and export a PNG or SVG. Atlas saves the project in your browser.
  image:
    src: /atlas-mark.svg
    alt: Homelab Atlas mark with three stepped teal strokes
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Explore the editor
      link: /editor
    - theme: alt
      text: GitHub
      link: https://github.com/aiden0rchad/homelab-atlas

features:
  - title: Add your gear
    details: Add servers, network devices, hardware notes, service groups, VLAN labels, and connections.
  - title: Run it at home
    details: Atlas runs on your own machine. There are no accounts, telemetry, AI calls, automatic scans, or background polling.
  - title: Review discovery
    details: Run an explicit bounded Nmap scan, import Nmap XML, or use an optional Docker collector. Nothing is selected or added automatically.
  - title: Save and share
    details: Save JSON when you want an editable backup, or export an SVG or PNG when you want an image.
---

## See the editor

![Homelab Atlas editor showing a fictional sample project](./editor.png)

<p class="shot-caption">Add devices and services on the left, edit the details on the right, and see the diagram update in the middle.</p>

I posted a diagram of my homelab on Reddit and someone asked how they could make one too. I wanted an app that made diagrams like it easy to build and update without depending on an LLM. That's where Homelab Atlas started.

## See the result

![Example Homelab Atlas diagram exported from the fictional sample](./example.png)

<p class="shot-caption">Start with the automatic layout, then arrange device cards if the composition needs a small adjustment. The preview and exports stay in sync.</p>

## Making your first diagram {#start-shape-save-share}

<div class="flow">
  <div><strong>1 · Start</strong>Load the example or begin empty.</div>
  <div><strong>2 · Inventory</strong>Add devices, hardware, and services.</div>
  <div><strong>3 · Connect</strong>Add networks, VLANs, and relationships.</div>
  <div><strong>4 · Refine</strong>Choose the style or arrange device cards.</div>
  <div><strong>5 · Save</strong>Back up JSON; export SVG or PNG.</div>
</div>

Atlas only knows what you add or import. Start with [installation and safe deployment](/getting-started), then use the [editor guide](/editor) when you want more detail on the controls.

Quick paths: [Docker Compose](/getting-started#docker-compose-recommended), [Unraid](/unraid), [stack managers](/getting-started#stack-manager), [Docker run](/getting-started#docker-run), or [native Go](/getting-started#direct-go-fallback).

<div class="support">
If Homelab Atlas is useful to you, you can <a href="https://www.buymeacoffee.com/aiden0rchad" target="_blank" rel="noopener noreferrer">buy me a coffee</a>.
</div>

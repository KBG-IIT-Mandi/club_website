import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NavBar from '../Components/NavBar';
import Footer from '../Components/Footer/Footer';
import Home from '../Pages/Home/Home';

const INVITE_URL = 'https://discord.gg/QttCgAqCp6';

const render = (component) =>
  renderToStaticMarkup(<MemoryRouter>{component}</MemoryRouter>);

const escapedInvite = INVITE_URL.replaceAll('.', '\\.');
const discordAnchors = (markup) =>
  markup.match(new RegExp(`<a[^>]+href="${escapedInvite}"[^>]*>`, 'g')) || [];

describe('Discord community entry points', () => {
  it.each([
    ['navigation', <NavBar />, 1],
    ['home page', <Home />, 2],
    ['footer', <Footer />, 1],
  ])('renders safe permanent invite links in the %s', (_surface, component, count) => {
    const anchors = discordAnchors(render(component));

    expect(anchors).toHaveLength(count);
    for (const anchor of anchors) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });
});

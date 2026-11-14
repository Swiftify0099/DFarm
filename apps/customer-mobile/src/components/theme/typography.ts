import { TextStyle } from 'react-native';

export const typography: Record<string, TextStyle> = {
  h1: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    color: '#0F172A',
  },
  h2: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    color: '#0F172A',
  },
  h3: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    color: '#0F172A',
  },
  h4: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    color: '#0F172A',
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: '#334155',
  },
  bodyBold: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: '#0F172A',
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: '#64748B',
  },
  captionBold: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    color: '#475569',
  },
  code: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#0F172A',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    color: '#0F172A',
  },
};

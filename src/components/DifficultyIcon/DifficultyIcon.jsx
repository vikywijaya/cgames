import PropTypes from 'prop-types';
import { Plant, Drop, Fire } from '@phosphor-icons/react';

const ICONS = { easy: Plant, medium: Drop, hard: Fire };

/** Shared filled Phosphor icon for the difficulty pickers (lobby + GameShell). */
export function DifficultyIcon({ level, size = 14 }) {
  const Icon = ICONS[level];
  return Icon ? <Icon size={size} weight="fill" aria-hidden="true" /> : null;
}

DifficultyIcon.propTypes = { level: PropTypes.string.isRequired, size: PropTypes.number };

const fs = require('fs');
const path = require('path');

const skillsDir = path.join(__dirname, '..', 'skills');

function loadSkill(filename) {
  return fs.readFileSync(path.join(skillsDir, filename), 'utf-8');
}

function buildSystemPrompt(skillFile) {
  const dudaContext = loadSkill('duda-context.md');
  const skill = loadSkill(skillFile);
  return `${dudaContext}\n\n---\n\n${skill}`;
}

const SKILLS = {
  'success-story': {
    name: 'Customer Success Story',
    file: 'success-story-writer.md',
  },
  'power-quotes': {
    name: 'Power Quotes',
    file: 'power-quotes-identifier.md',
  },
  'use-case-slide': {
    name: 'Use Case Slide',
    file: 'use-case-slide-writer.md',
  },
  'sales-email': {
    name: 'Sales Rep Email',
    file: 'sales-email-writer.md',
  },
};

module.exports = { buildSystemPrompt, SKILLS };

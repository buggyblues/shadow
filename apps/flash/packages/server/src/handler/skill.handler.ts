import { Hono } from 'hono'
import { skillService } from '../service/skill.service.js'
import { err, ok } from '../shared/result.js'

const app = new Hono()

app.get('/api/skills', async (c) => {
  const allSkills = await skillService.listAll()
  return c.json(ok(allSkills))
})

app.get('/api/skills/:id', (c) => {
  const skill = skillService.getById(c.req.param('id'))
  if (!skill) return c.json(err('Skill not found'), 404)
  return c.json(ok(skill))
})

app.post('/api/skills/:id/install', async (c) => {
  const result = await skillService.install(c.req.param('id'))
  if (result.error) return c.json(err(result.error), result.error === 'Skill not found' ? 404 : 500)
  return c.json(ok(result.skill))
})

export default app

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import {
  isDatabaseFoundationEnabled,
  requireDatabaseFoundation,
} from '../../middleware/featureAvailability';
import { timesheetReportService } from './service';

const router = Router();
const requireTimesheetPersistenceFoundation = requireDatabaseFoundation({
  feature: 'TIMESHEET_REPORT_PERSISTENCE',
  enabled: () => isDatabaseFoundationEnabled('ENABLE_TIMESHEET_REPORT_PERSISTENCE'),
  message: 'Timesheet report persistence is not available in this environment.',
  nextStep: 'Complete the timesheet reporting database reconciliation before saving records.',
});

router.get('/templates', authenticate, (_req: Request, res: Response) => {
  const templates = timesheetReportService.listTemplates();
  res.json(templates);
});

router.get('/presets', authenticate, (_req: Request, res: Response) => {
  timesheetReportService
    .listPresets()
    .then((presets) => res.json(presets))
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to list timesheet presets';
      res.status(400).json({ error: message });
    });
});

router.get('/presets/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const payload = await timesheetReportService.getPreset(String(req.params.id || ''));
    if (!payload) {
      res.status(404).json({ error: 'Timesheet preset not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get timesheet preset';
    res.status(400).json({ error: message });
  }
});

router.post('/presets', authenticate, requireTimesheetPersistenceFoundation, async (req: Request, res: Response) => {
  try {
    const payload = await timesheetReportService.createPreset(req.body || {});
    res.status(201).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create timesheet preset';
    res.status(400).json({ error: message });
  }
});

router.put('/presets/:id', authenticate, requireTimesheetPersistenceFoundation, async (req: Request, res: Response) => {
  try {
    const payload = await timesheetReportService.updatePreset(String(req.params.id || ''), req.body || {});
    if (!payload) {
      res.status(404).json({ error: 'Timesheet preset not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update timesheet preset';
    res.status(400).json({ error: message });
  }
});

router.delete('/presets/:id', authenticate, requireTimesheetPersistenceFoundation, async (req: Request, res: Response) => {
  try {
    const payload = await timesheetReportService.deactivatePreset(String(req.params.id || ''));
    if (!payload) {
      res.status(404).json({ error: 'Timesheet preset not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate timesheet preset';
    res.status(400).json({ error: message });
  }
});

router.post('/preset/resolve', authenticate, async (req: Request, res: Response) => {
  try {
    const preset = await timesheetReportService.resolvePreset(req.body || {});
    res.json(preset);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve timesheet preset';
    res.status(400).json({ error: message });
  }
});

router.post('/autofill', authenticate, async (req: Request, res: Response) => {
  try {
    const payload = await timesheetReportService.autofillRows(req.body);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to auto-fill timesheet report rows';
    res.status(400).json({ error: message });
  }
});

router.post('/generate', authenticate, (req: Request, res: Response) => {
  try {
    const payload = timesheetReportService.generate(req.body);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate timesheet report payload';
    res.status(400).json({ error: message });
  }
});

router.post('/render', authenticate, (req: Request, res: Response) => {
  try {
    const payload = timesheetReportService.render(req.body);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to render timesheet report output';
    res.status(400).json({ error: message });
  }
});

router.post('/render-docx', authenticate, async (req: Request, res: Response) => {
  try {
    const payload = await timesheetReportService.renderDocx(req.body);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to render timesheet report DOCX output';
    res.status(400).json({ error: message });
  }
});

router.get('/instances', authenticate, async (req: Request, res: Response) => {
  try {
    const limitRaw = Number(req.query.limit || 30);
    const payload = await timesheetReportService.listInstances(limitRaw);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list timesheet report instances';
    res.status(400).json({ error: message });
  }
});

router.get('/instances/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id || '');
    const payload = await timesheetReportService.getInstance(instanceId);
    if (!payload) {
      res.status(404).json({ error: 'Timesheet report instance not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get timesheet report instance';
    res.status(400).json({ error: message });
  }
});

router.post('/instances', authenticate, requireTimesheetPersistenceFoundation, async (req: Request, res: Response) => {
  try {
    const payload = await timesheetReportService.createInstance(req.body);
    res.status(201).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create timesheet report instance';
    res.status(400).json({ error: message });
  }
});

router.put('/instances/:id', authenticate, requireTimesheetPersistenceFoundation, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id || '');
    const payload = await timesheetReportService.updateInstance(instanceId, req.body);
    if (!payload) {
      res.status(404).json({ error: 'Timesheet report instance not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update timesheet report instance';
    res.status(400).json({ error: message });
  }
});

router.post('/instances/:id/render', authenticate, requireTimesheetPersistenceFoundation, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id || '');
    const payload = await timesheetReportService.renderInstance(instanceId);
    if (!payload) {
      res.status(404).json({ error: 'Timesheet report instance not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to render timesheet report instance output';
    res.status(400).json({ error: message });
  }
});

router.post('/instances/:id/render-docx', authenticate, requireTimesheetPersistenceFoundation, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id || '');
    const payload = await timesheetReportService.renderDocxInstance(instanceId);
    if (!payload) {
      res.status(404).json({ error: 'Timesheet report instance not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to render timesheet report instance DOCX output';
    res.status(400).json({ error: message });
  }
});

router.get('/instances/:id/artifacts', authenticate, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id || '');
    const limitRaw = Number(req.query.limit || 30);
    const payload = await timesheetReportService.listArtifacts(instanceId, limitRaw);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list timesheet report artifacts';
    res.status(400).json({ error: message });
  }
});

router.get('/instances/:id/artifacts/:artifactId', authenticate, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id || '');
    const artifactId = String(req.params.artifactId || '');
    const payload = await timesheetReportService.getArtifact(instanceId, artifactId);
    if (!payload) {
      res.status(404).json({ error: 'Timesheet report artifact not found' });
      return;
    }
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get timesheet report artifact';
    res.status(400).json({ error: message });
  }
});

export default router;


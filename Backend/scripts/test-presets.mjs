import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function test() {
  try {
    // Test list
    const all = await p.timesheetPreset.findMany({ take: 5 });
    console.log('count:', all.length);
    if (all.length > 0) {
      console.log('first:', JSON.stringify({ id: all[0].id, name: all[0].name, layer: all[0].layer }));
    }

    // Test create a lawyer preset
    const lawyerPreset = await p.timesheetPreset.create({
      data: {
        name: 'Test Lawyer Preset',
        templateFamily: 'HU_DETAILED_MONTHLY',
        layer: 'LAWYER_DEFAULT',
        lawyerName: 'Dr. Test Lawyer',
        isActive: true
      }
    });
    console.log('created lawyer preset:', lawyerPreset.id, lawyerPreset.name);

    // Test create client preset
    const clientPreset = await p.timesheetPreset.create({
      data: {
        name: 'Test Client Preset',
        templateFamily: 'HU_DETAILED_MONTHLY',
        layer: 'CLIENT_DEFAULT',
        clientName: 'Test Client Kft',
        isActive: true
      }
    });
    console.log('created client preset:', clientPreset.id);

    // Test create client+lawyer override
    const overridePreset = await p.timesheetPreset.create({
      data: {
        name: 'Test Client+Lawyer Override',
        templateFamily: 'HU_DETAILED_MONTHLY',
        layer: 'CLIENT_LAWYER_OVERRIDE',
        lawyerName: 'Dr. Test Lawyer',
        clientName: 'Test Client Kft',
        isActive: true
      }
    });
    console.log('created override preset:', overridePreset.id);

    // Verify list
    const allAfter = await p.timesheetPreset.findMany({ where: { isActive: true } });
    console.log('total active presets:', allAfter.length);

    // Test deactivation
    await p.timesheetPreset.update({ where: { id: lawyerPreset.id }, data: { isActive: false } });
    const afterDeact = await p.timesheetPreset.findMany({ where: { isActive: true } });
    console.log('after deactivation:', afterDeact.length, 'active');

    console.log('\nAll operations succeeded.');
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await p.$disconnect();
  }
}

test();
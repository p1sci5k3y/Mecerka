import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Role } from '@prisma/client';

describe('AdminController', () => {
  let controller: AdminController;
  let adminServiceMock: jest.Mocked<Partial<AdminService>>;

  const mockReq = (userId = 'admin-1') => ({
    user: { userId, roles: [Role.ADMIN] },
  });

  beforeEach(async () => {
    adminServiceMock = {
      getAllUsers: jest.fn(),
      getUserById: jest.fn(),
      getUserGovernanceHistory: jest.fn(),
      grantRole: jest.fn(),
      revokeRole: jest.fn(),
      activateUser: jest.fn(),
      blockUser: jest.fn(),
      grantProvider: jest.fn(),
      grantRunner: jest.fn(),
      getAllCities: jest.fn(),
      createCity: jest.fn(),
      updateCity: jest.fn(),
      deleteCity: jest.fn(),
      getAllCategories: jest.fn(),
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
      deleteCategory: jest.fn(),
      getRecentRefunds: jest.fn(),
      getRecentIncidents: jest.fn(),
      getEmailSettings: jest.fn(),
      updateEmailSettings: jest.fn(),
      sendEmailSettingsTest: jest.fn(),
      getMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: adminServiceMock }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('getUsers delegates to adminService.getAllUsers', async () => {
    (adminServiceMock.getAllUsers as jest.Mock).mockResolvedValue([]);
    const result = await controller.getUsers();
    expect(adminServiceMock.getAllUsers).toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('getUser delegates to adminService.getUserById', async () => {
    (adminServiceMock.getUserById as jest.Mock).mockResolvedValue({
      id: 'u1',
    });

    const result = await controller.getUser('u1');

    expect(adminServiceMock.getUserById).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ id: 'u1' });
  });

  it('getUserGovernanceHistory delegates to adminService.getUserGovernanceHistory', async () => {
    (adminServiceMock.getUserGovernanceHistory as jest.Mock).mockResolvedValue([
      { id: 'audit-1' },
    ]);

    const result = await controller.getUserGovernanceHistory('u1');

    expect(adminServiceMock.getUserGovernanceHistory).toHaveBeenCalledWith(
      'u1',
    );
    expect(result).toEqual([{ id: 'audit-1' }]);
  });

  it('grantRole delegates to adminService with user id, role, and actor', async () => {
    (adminServiceMock.grantRole as jest.Mock).mockResolvedValue({ id: 'u1' });
    const result = await controller.grantRole(
      'u1',
      { role: Role.PROVIDER },
      mockReq() as any,
    );
    expect(adminServiceMock.grantRole).toHaveBeenCalledWith(
      'u1',
      Role.PROVIDER,
      'admin-1',
    );
    expect(result).toEqual({ id: 'u1' });
  });

  it('revokeRole delegates to adminService', async () => {
    (adminServiceMock.revokeRole as jest.Mock).mockResolvedValue({ id: 'u1' });
    await controller.revokeRole('u1', { role: Role.CLIENT }, mockReq() as any);
    expect(adminServiceMock.revokeRole).toHaveBeenCalledWith(
      'u1',
      Role.CLIENT,
      'admin-1',
    );
  });

  it('activateUser delegates to adminService', async () => {
    (adminServiceMock.activateUser as jest.Mock).mockResolvedValue({
      id: 'u1',
      active: true,
    });
    await controller.activateUser('u1', mockReq() as any);
    expect(adminServiceMock.activateUser).toHaveBeenCalledWith('u1', 'admin-1');
  });

  it('blockUser delegates to adminService', async () => {
    (adminServiceMock.blockUser as jest.Mock).mockResolvedValue({
      id: 'u1',
      active: false,
    });
    await controller.blockUser('u1', mockReq() as any);
    expect(adminServiceMock.blockUser).toHaveBeenCalledWith('u1', 'admin-1');
  });

  it('grantProvider delegates to adminService', async () => {
    (adminServiceMock.grantProvider as jest.Mock).mockResolvedValue({
      id: 'u1',
    });
    await controller.grantProvider('u1', mockReq() as any);
    expect(adminServiceMock.grantProvider).toHaveBeenCalledWith(
      'u1',
      'admin-1',
    );
  });

  it('grantRunner delegates to adminService', async () => {
    (adminServiceMock.grantRunner as jest.Mock).mockResolvedValue({ id: 'u1' });
    await controller.grantRunner('u1', mockReq() as any);
    expect(adminServiceMock.grantRunner).toHaveBeenCalledWith('u1', 'admin-1');
  });

  it('getCities delegates to adminService.getAllCities', async () => {
    (adminServiceMock.getAllCities as jest.Mock).mockResolvedValue([]);
    const result = await controller.getCities();
    expect(result).toEqual([]);
  });

  it('createCity delegates to adminService.createCity', async () => {
    (adminServiceMock.createCity as jest.Mock).mockResolvedValue({
      id: 'city-1',
    });
    const result = await controller.createCity({
      name: 'Toledo',
      slug: 'toledo',
    } as any);
    expect(adminServiceMock.createCity).toHaveBeenCalledWith({
      name: 'Toledo',
      slug: 'toledo',
    });
    expect(result).toEqual({ id: 'city-1' });
  });

  it('updateCity delegates to adminService.updateCity', async () => {
    (adminServiceMock.updateCity as jest.Mock).mockResolvedValue({
      id: 'city-1',
    });
    await controller.updateCity('city-1', { name: 'Toledo Updated' } as any);
    expect(adminServiceMock.updateCity).toHaveBeenCalledWith('city-1', {
      name: 'Toledo Updated',
    });
  });

  it('deleteCity delegates to adminService.deleteCity', async () => {
    (adminServiceMock.deleteCity as jest.Mock).mockResolvedValue({
      id: 'city-1',
    });
    await controller.deleteCity('city-1');
    expect(adminServiceMock.deleteCity).toHaveBeenCalledWith('city-1');
  });

  it('getCategories delegates to adminService.getAllCategories', async () => {
    (adminServiceMock.getAllCategories as jest.Mock).mockResolvedValue([]);
    const result = await controller.getCategories();
    expect(result).toEqual([]);
  });

  it('createCategory delegates to adminService.createCategory', async () => {
    (adminServiceMock.createCategory as jest.Mock).mockResolvedValue({
      id: 'cat-1',
    });
    await controller.createCategory({
      name: 'Panadería',
      slug: 'panaderia',
    } as any);
    expect(adminServiceMock.createCategory).toHaveBeenCalled();
  });

  it('updateCategory delegates to adminService.updateCategory', async () => {
    (adminServiceMock.updateCategory as jest.Mock).mockResolvedValue({
      id: 'cat-1',
    });
    await controller.updateCategory('cat-1', { name: 'Updated' } as any);
    expect(adminServiceMock.updateCategory).toHaveBeenCalledWith('cat-1', {
      name: 'Updated',
    });
  });

  it('deleteCategory delegates to adminService.deleteCategory', async () => {
    (adminServiceMock.deleteCategory as jest.Mock).mockResolvedValue({
      id: 'cat-1',
    });
    await controller.deleteCategory('cat-1');
    expect(adminServiceMock.deleteCategory).toHaveBeenCalledWith('cat-1');
  });

  it('getMetrics delegates to adminService.getMetrics', async () => {
    (adminServiceMock.getMetrics as jest.Mock).mockResolvedValue({ users: 5 });
    const result = await controller.getMetrics();
    expect(result).toEqual({ users: 5 });
  });

  it('getEmailSettings delegates to adminService.getEmailSettings', async () => {
    (adminServiceMock.getEmailSettings as jest.Mock).mockResolvedValue({
      host: 'email-smtp.eu-west-1.amazonaws.com',
    });

    const result = await controller.getEmailSettings();

    expect(adminServiceMock.getEmailSettings).toHaveBeenCalled();
    expect(result).toEqual({ host: 'email-smtp.eu-west-1.amazonaws.com' });
  });

  it('updateEmailSettings delegates to adminService.updateEmailSettings', async () => {
    (adminServiceMock.updateEmailSettings as jest.Mock).mockResolvedValue({
      host: 'email-smtp.eu-west-1.amazonaws.com',
    });

    const body = {
      host: 'email-smtp.eu-west-1.amazonaws.com',
      port: 587,
      user: 'smtp-user',
      from: 'no-reply@example.com',
    };

    await controller.updateEmailSettings(body as any, mockReq() as any);

    expect(adminServiceMock.updateEmailSettings).toHaveBeenCalledWith(
      body,
      'admin-1',
    );
  });

  it('sendEmailSettingsTest delegates to adminService.sendEmailSettingsTest', async () => {
    (adminServiceMock.sendEmailSettingsTest as jest.Mock).mockResolvedValue({
      ok: true,
    });

    const result = await controller.sendEmailSettingsTest({
      recipient: 'ops@example.com',
    });

    expect(adminServiceMock.sendEmailSettingsTest).toHaveBeenCalledWith(
      'ops@example.com',
    );
    expect(result).toEqual({ ok: true });
  });

  it('getRefunds delegates to adminService.getRecentRefunds', async () => {
    (adminServiceMock.getRecentRefunds as jest.Mock).mockResolvedValue([
      { id: 'refund-1' },
    ]);

    const result = await controller.getRefunds();

    expect(adminServiceMock.getRecentRefunds).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'refund-1' }]);
  });

  it('getIncidents delegates to adminService.getRecentIncidents', async () => {
    (adminServiceMock.getRecentIncidents as jest.Mock).mockResolvedValue([
      { id: 'incident-1' },
    ]);

    const result = await controller.getIncidents();

    expect(adminServiceMock.getRecentIncidents).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'incident-1' }]);
  });
});

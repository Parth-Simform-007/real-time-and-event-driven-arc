import { Controller, All, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProxyService } from './proxy.service';

@Controller()
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  // ── Public auth routes ────────────────────────────────────────────────────
  @All('auth/*')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    const path = '/api/' + req.path.replace(/^\/api\//, '');
    const data = await this.proxy.forward(process.env.USER_SERVICE_URL, req.method, path, req.body);
    return res.json(data);
  }

  // ── Protected user routes ────────────────────────────────────────────────
  @All('users/*')
  @UseGuards(JwtAuthGuard)
  async proxyUsers(@Req() req: Request, @Res() res: Response) {
    const path = '/api/' + req.path.replace(/^\/api\//, '');
    const data = await this.proxy.forward(
      process.env.USER_SERVICE_URL,
      req.method,
      path,
      req.body,
      (req as any).user,
    );
    return res.json(data);
  }

  // ── Protected ride routes ────────────────────────────────────────────────
  @All('rides/*')
  @UseGuards(JwtAuthGuard)
  async proxyRides(@Req() req: Request, @Res() res: Response) {
    const path = '/api/' + req.path.replace(/^\/api\//, '');
    const data = await this.proxy.forward(
      process.env.RIDE_SERVICE_URL,
      req.method,
      path,
      req.body,
      (req as any).user,
    );
    return res.json(data);
  }

  // ── Protected payment routes ─────────────────────────────────────────────
  @All('payments/*')
  @UseGuards(JwtAuthGuard)
  async proxyPayments(@Req() req: Request, @Res() res: Response) {
    const path = '/api/' + req.path.replace(/^\/api\//, '');
    const data = await this.proxy.forward(
      process.env.PAYMENT_SERVICE_URL,
      req.method,
      path,
      req.body,
      (req as any).user,
    );
    return res.json(data);
  }
}

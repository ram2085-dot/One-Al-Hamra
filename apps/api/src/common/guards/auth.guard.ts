import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';

export const PUBLIC_KEY = 'isPublic';
export const Public = () => Reflect.metadata(PUBLIC_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest();
    if (isPublic) return true;

    const token = request.cookies?.session;
    if (!token) throw new UnauthorizedException('No session');
    request.user = await this.authService.verify(token);
    return true;
  }
}

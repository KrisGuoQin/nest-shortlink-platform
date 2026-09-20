import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

@Injectable()
export class ShortCodePipe implements PipeTransform<string, string> {
    transform(value: string, metadata: ArgumentMetadata): string {
        const code = value.trim()
        if (!/^[0-9A-Za-z]{6,16}$/.test(code)) {
            throw new BadRequestException('Invalid short code')
        }
        return code
    }
}
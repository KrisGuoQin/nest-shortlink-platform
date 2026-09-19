export interface JwtPayload {
    sub: string; // subject 
    iat?: number;
    exp?: number;
}
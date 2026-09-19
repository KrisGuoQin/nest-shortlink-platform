export interface JwtPayload {
    sub: string; // subject 
    iat?: number;
    exp?: number;
}

export interface AccessTokenPayload {
    sub: string; // subject='user-id'
    sid: string; // session-id
    type: 'access';
    iat?: number;
    exp?: number;
}

// 防止有人把refresh-token拿去访问普通API
export interface RefreshTokenPayload {
    sub: string;
    sid: string;
    ver:number;
    iat?:number;
    exp?:number;
    type: 'refresh';
}
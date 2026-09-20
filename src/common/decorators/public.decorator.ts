import { SetMetadata } from "@nestjs/common"

// 首先需要一个Key
export const IS_PUBLIC_KEY = "is_public"
// 然后需要使用SetMetadata
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
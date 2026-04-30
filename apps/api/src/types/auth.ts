export interface AuthContext {
  userId: string;
  email: string;
  userType: "solo" | "agency";
}

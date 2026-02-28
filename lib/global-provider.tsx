import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect
} from "react";
import { account, getFullUserData } from "./appwrite";
import { useAppwrite } from "./useAppwrite";

interface GlobalContextType {
  isLogged: boolean;
  user: User | null;
  loading: boolean;
  refetch: () => void;
  setUser: (user: User | null) => void;
  logoutUser: () => Promise<boolean>;
}

interface User {
  $id: string;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

interface GlobalProviderProps {
  children: ReactNode;
}

export const GlobalProvider = ({ children }: GlobalProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const {
    data: initialUserData,
    loading,
    refetch: refetchAppwrite
  } = useAppwrite({
    fn: getFullUserData
  });

  useEffect(() => {
    if (initialUserData) {
      const transformedUser: User = {
        $id: initialUserData.$id,
        name: initialUserData.name,
        email: initialUserData.email,
        firstName: initialUserData.firstName,
        lastName: initialUserData.lastName,
        avatarUrl: initialUserData.avatarUrl
      };
      setUser(transformedUser);
    } else if (initialUserData === null) {
      // If getFullUserData returns null, user is not logged in
      setUser(null);
    }
  }, [initialUserData]);

  const isLogged = !!user;

  const refetch = async () => {
    await refetchAppwrite();
  };

  const logoutUser = async () => {
    try {
      await account.deleteSession("current");
      setUser(null);
      return true;
    } catch (error) {
      // If session doesn't exist or user is already logged out, still clear the user
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("Session could not be found") ||
        errorMessage.includes("missing scopes") ||
        errorMessage.includes("Unauthorized")
      ) {
        console.log("Session already deleted, clearing user state");
        setUser(null);
        return true;
      }
      console.log("Error logging out:", error);
      return false;
    }
  };

  return (
    <GlobalContext.Provider
      value={{
        isLogged,
        user,
        loading,
        refetch,
        setUser,
        logoutUser
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
};

export const useGlobalContext = (): GlobalContextType => {
  const context = useContext(GlobalContext);
  if (!context)
    throw new Error("useGlobalContext must be used within a GlobalProvider");
  return context;
};

export default GlobalProvider;

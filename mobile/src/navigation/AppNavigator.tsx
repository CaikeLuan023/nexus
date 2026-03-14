import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import TwoFactorScreen from '../screens/TwoFactorScreen';
import OverviewScreen from '../screens/OverviewScreen';
import OSListScreen from '../screens/OSListScreen';
import OSDetailScreen from '../screens/OSDetailScreen';
import OSChatScreen from '../screens/OSChatScreen';
import EquipeScreen from '../screens/EquipeScreen';
import VendedorDashboardScreen from '../screens/vendedor/VendedorDashboardScreen';
import NegocioListScreen from '../screens/vendedor/NegocioListScreen';
import NegocioDetailScreen from '../screens/vendedor/NegocioDetailScreen';
import NovoNegocioScreen from '../screens/vendedor/NovoNegocioScreen';
import ContratoListScreen from '../screens/vendedor/ContratoListScreen';
import NovoContratoScreen from '../screens/vendedor/NovoContratoScreen';
import PerfilVendedorScreen from '../screens/vendedor/PerfilVendedorScreen';
import CatalogoScreen from '../screens/vendedor/CatalogoScreen';
import { colors } from '../theme';

export type RootStackParamList = {
  Login: undefined;
  TwoFactor: undefined;
  Overview: undefined;
  MainTabs: undefined;
};

export type OSStackParamList = {
  OSList: undefined;
  OSDetail: { osId: number };
  OSChat: { osId: number; osNumero: string };
};

export type VendedorPipelineParamList = {
  NegocioList: undefined;
  NegocioDetail: { negocioId: number };
  NovoNegocio: undefined;
  FecharContrato: { clienteNome?: string; clienteTel?: string; plano?: string; valor?: string; negocioId?: number };
};

export type VendedorContratosParamList = {
  ContratoList: undefined;
  NovoContrato: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const OSStack = createStackNavigator<OSStackParamList>();
const PipelineStack = createStackNavigator<VendedorPipelineParamList>();
const ContratosStack = createStackNavigator<VendedorContratosParamList>();
const Tab = createBottomTabNavigator();
const VendedorTab = createBottomTabNavigator();

function OSStackNavigator() {
  return (
    <OSStack.Navigator screenOptions={{ headerShown: false }}>
      <OSStack.Screen name="OSList" component={OSListScreen} />
      <OSStack.Screen name="OSDetail" component={OSDetailScreen} />
      <OSStack.Screen name="OSChat" component={OSChatScreen} />
    </OSStack.Navigator>
  );
}

function TecnicoTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
          if (route.name === 'OS') iconName = 'clipboard-outline';
          else if (route.name === 'Equipe') iconName = 'people-outline';
          else if (route.name === 'Inicio') iconName = 'home-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen name="OS" component={OSStackNavigator} />
      <Tab.Screen name="Equipe" component={EquipeScreen} />
      <Tab.Screen name="Inicio" component={OverviewScreen} />
    </Tab.Navigator>
  );
}

function VendedorPipelineStackNavigator() {
  return (
    <PipelineStack.Navigator screenOptions={{ headerShown: false }}>
      <PipelineStack.Screen name="NegocioList" component={NegocioListScreen} />
      <PipelineStack.Screen name="NegocioDetail" component={NegocioDetailScreen} />
      <PipelineStack.Screen name="NovoNegocio" component={NovoNegocioScreen} />
      <PipelineStack.Screen name="FecharContrato" component={NovoContratoScreen} />
    </PipelineStack.Navigator>
  );
}

function VendedorContratosStackNavigator() {
  return (
    <ContratosStack.Navigator screenOptions={{ headerShown: false }}>
      <ContratosStack.Screen name="ContratoList" component={ContratoListScreen} />
      <ContratosStack.Screen name="NovoContrato" component={NovoContratoScreen} />
    </ContratosStack.Navigator>
  );
}

function VendedorTabNavigator() {
  return (
    <VendedorTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
          if (route.name === 'Dashboard') iconName = 'home-outline';
          else if (route.name === 'Pipeline') iconName = 'funnel-outline';
          else if (route.name === 'Catalogo') iconName = 'pricetags-outline';
          else if (route.name === 'Contratos') iconName = 'document-text-outline';
          else if (route.name === 'Perfil') iconName = 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      })}
    >
      <VendedorTab.Screen name="Dashboard" component={VendedorDashboardScreen} />
      <VendedorTab.Screen name="Pipeline" component={VendedorPipelineStackNavigator} />
      <VendedorTab.Screen name="Catalogo" component={CatalogoScreen} />
      <VendedorTab.Screen name="Contratos" component={VendedorContratosStackNavigator} />
      <VendedorTab.Screen name="Perfil" component={PerfilVendedorScreen} />
    </VendedorTab.Navigator>
  );
}

export default function AppNavigator() {
  const { isLoading, isAuthenticated, pending2fa, user } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgScreen }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isTecnicoCampo = user?.perfil === 'tecnico_campo';
  const isVendedor = user?.perfil === 'vendedor';

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          isTecnicoCampo ? (
            <Stack.Screen name="MainTabs" component={TecnicoTabNavigator} />
          ) : isVendedor ? (
            <Stack.Screen name="MainTabs" component={VendedorTabNavigator} />
          ) : (
            <Stack.Screen name="Overview" component={OverviewScreen} />
          )
        ) : pending2fa ? (
          <Stack.Screen name="TwoFactor" component={TwoFactorScreen} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

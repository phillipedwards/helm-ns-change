import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as containerservice from "@pulumi/azure-native/containerservice";
import * as k8s from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";

// Create an Azure Resource Group
const resourceGroup = new resources.ResourceGroup("azure-go-aks");

// Generate an SSH key
const sshKey = new tls.PrivateKey("ssh-key", {
    algorithm: "RSA",
    rsaBits: 4096,
});

const config = new pulumi.Config();
const managedClusterName = config.get("managedClusterName") || "azure-aks";
const cluster = new containerservice.ManagedCluster(managedClusterName, {
    resourceGroupName: resourceGroup.name,
    agentPoolProfiles: [{
        count: 3,
        maxPods: 110,
        mode: "System",
        name: "agentpool",
        nodeLabels: {},
        osDiskSizeGB: 30,
        osType: "Linux",
        type: "VirtualMachineScaleSets",
        vmSize: "Standard_DS2_v2",
    }],
    dnsPrefix: resourceGroup.name,
    enableRBAC: true,
    kubernetesVersion: "1.26.0",
    linuxProfile: {
        adminUsername: "testuser",
        ssh: {
            publicKeys: [{
                keyData: sshKey.publicKeyOpenssh,
            }],
        },
    },
    nodeResourceGroup: `MC_azure-go_${managedClusterName}`,
    identity: {
        type: "SystemAssigned",
    }
});

const creds = containerservice.listManagedClusterUserCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    resourceName: cluster.name,
});

const encoded = creds.kubeconfigs[0].value;
export const kubeconfig = pulumi.secret(encoded.apply(enc => Buffer.from(enc, "base64").toString()));

const provider = new k8s.Provider("provider", {
    kubeconfig: kubeconfig,
});

// Change the namespace's name to trigger a deletion and recreation of the namespace
// the expectation is k8s resources in a namespace will be deleted before the namespace is deleted.
// The new namespace will then be created and all relevant k8s resources
// The new namespace is created however any resources within that namespace are not created.
const ns = new k8s.core.v1.Namespace("ns", {
    metadata: {
        name: "ingress-nginx"
    }
}, { provider });

new k8s.helm.v3.Release("nginx", {
    chart: "ingress-nginx",
    namespace: ns.metadata.name,
    createNamespace: false,
    repositoryOpts: {
        repo: "https://kubernetes.github.io/ingress-nginx"
    },
    version: "4.7.1",
    values: {
        controller: {
            replicaCount: 1,
            nodeSelector: {
                "kubernetes.io/os": "linux"
            },
            admissionWebhooks: {
                patch: {
                    nodeSelector: {
                        "kubernetes.io/os": "linux"
                    }
                }
            },
        },
        defaultBackend: {
            nodeSelector: {
                "kubernetes.io/os": "linux"
            }
        }
    },
}, { provider });
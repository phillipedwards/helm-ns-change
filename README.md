# Pulumi Helm Release
This is meant to show the case where a Pulumi Helm Release cannot handle the case where the namespace provided to the release is recreated. All k8s resources within the namespace should be deleted and recreated in the new namespace, however, the latter part does not occur.

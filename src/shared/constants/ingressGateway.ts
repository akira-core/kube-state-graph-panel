// The node label the backend guarantees on every ingress-gateway node (any kind):
// `labels.role === "ingress-gateway"`. Single source for the element-filter's
// ingress predicate and its tests — if the backend renames the label, this file
// is the only place to touch.
export const INGRESS_LABEL_KEY = 'role';
export const INGRESS_LABEL_VALUE = 'ingress-gateway';

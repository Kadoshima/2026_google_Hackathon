# Toward Ultra-Fast Graph Learning: Adaptive Mesh Reordering

**Authors**: Anonymous Team, Example University

## Abstract

We present **AMR-Net**, a novel framework for graph representation learning
that achieves unprecedented speedups over prior work. Our method is
significantly faster and more accurate than existing baselines. We evaluate
on several benchmarks and show state-of-the-art performance. The proposed
technique is broadly applicable to many real-world scenarios.

## 1. Introduction

Graph neural networks (GNNs) have revolutionized many fields. However,
existing methods are slow and do not scale. In this paper, we propose a new
approach that is much faster. Our contributions are:

- A novel adaptive mesh reordering algorithm.
- Extensive experiments showing big improvements.
- A theoretical analysis (see appendix).

Our method is the first to combine mesh reordering with message passing
in a unified way, and we believe it will have significant impact on the
community.

## 2. Related Work

Prior work on GNNs is extensive. GCN [1] and GAT [2] are classical methods.
More recent approaches include SGC and APPNP. None of them address the
scalability issue adequately.

## 3. Method

Our method consists of three steps:

1. **Mesh Construction**: We construct a mesh over the input graph by
   grouping nodes that share common neighbors.
2. **Adaptive Reordering**: We reorder mesh elements to improve cache
   locality. The reordering is learned end-to-end.
3. **Message Passing**: We apply standard message passing on the reordered
   mesh.

The key insight is that reordering improves cache hit rate, which leads to
faster execution. We use a learned permutation matrix that is differentiable.

## 4. Experiments

We evaluate AMR-Net on three benchmarks: Cora, Citeseer, and a proprietary
industry dataset. The results show that AMR-Net is much faster than the
baselines and achieves higher accuracy.

Table 1 shows the accuracy numbers. Our method consistently outperforms the
baselines. Figure 3 shows the runtime comparison. AMR-Net is up to 10x
faster.

| Method | Cora | Citeseer |
|--------|------|----------|
| GCN    | 81.5 | 70.3     |
| GAT    | 83.0 | 72.5     |
| Ours   | **85.2** | **74.0** |

## 5. Discussion

The speedup comes from better cache locality. This is a well-known
technique in high-performance computing, and we are the first to apply it
to GNNs. The accuracy improvement is due to the learned reordering.

## 6. Conclusion

We presented AMR-Net, which is faster and more accurate. Future work
includes extending to dynamic graphs.

## References

[1] Kipf and Welling, "Semi-Supervised Classification with Graph
    Convolutional Networks", ICLR 2017.

[2] Velickovic et al., "Graph Attention Networks", ICLR 2018.
